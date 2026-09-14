import { createHash } from "node:crypto";
import type { ClientRequest, IncomingMessage } from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { isIP } from "node:net";

export type ResolvedAddress = Readonly<{ address: string; family: 4 | 6 }>;
export type SafeFetchRequest = Readonly<{
  url: string;
  maxBytes: number;
  timeoutMs: number;
  resolvedAddresses: readonly ResolvedAddress[];
  redirects?: readonly { url: string; resolvedAddresses: readonly ResolvedAddress[]; tlsServerName?: string }[];
  tlsServerName?: string;
  caller?: "api" | "media-worker";
  responseBytes?: number;
}>;
export type SafeFetchResult = Readonly<
  { allow: true; pinnedIp: string; finalUrl: string; tlsServerName: string } | { allow: false; reason: string }
>;
export type RuntimeSafeFetchRequest = Readonly<{
  url: string;
  maxBytes: number;
  timeoutMs: number;
  quarantineKey: string;
  caller?: "media-worker";
}>;
export type RuntimeSafeFetchResult = Readonly<
  | {
      allow: true;
      pinnedIp: string;
      finalUrl: string;
      tlsServerName: string;
      bytes: number;
      sha256: string;
      receipt: SafeFetchQuarantineReceipt;
    }
  | { allow: false; reason: string }
>;
export type SafeFetchQuarantineReceipt = Readonly<{ quarantineKey: string; bytes: number; sha256: string }>;
export type SafeFetchOperationContext = Readonly<{ signal: AbortSignal; deadlineAt: number }>;
export type SafeFetchQuarantineSink = Readonly<{
  /** Each operation is keyed so retries conditionally upsert the same quarantine object. */
  readonly capability?: "conditional-quarantine-v1";
  open(expectedQuarantineKey: string, context: SafeFetchOperationContext): Promise<void>;
  write(expectedQuarantineKey: string, chunk: Uint8Array, context: SafeFetchOperationContext): Promise<void>;
  complete(
    expectedQuarantineKey: string,
    accepted: {
      url: string;
      pinnedIp: string;
      tlsServerName: string;
      bytes: number;
      sha256: string;
    },
    context: SafeFetchOperationContext,
  ): Promise<SafeFetchQuarantineReceipt>;
  abort(expectedQuarantineKey: string, reason: string, context: SafeFetchOperationContext): Promise<void>;
}>;

export { isS3ConditionalQuarantineSink } from "./safe-fetch-attestation.js";
export { S3ConditionalQuarantineSink } from "./s3-conditional-quarantine-sink.js";
/** @deprecated Runtime SafeFetch streams to SafeFetchQuarantineSink. */
export type SafeFetchSink = (accepted: {
  url: string;
  pinnedIp: string;
  tlsServerName: string;
  maxBytes: number;
}) => Promise<void>;

export interface SafeFetchResolver {
  resolve(
    hostname: string,
    options: Readonly<{ signal: AbortSignal; deadlineAt: number }>,
  ): Promise<readonly ResolvedAddress[]>;
}
export type SafeFetchTransportRequest = Readonly<{
  url: string;
  pinnedIp: string;
  tlsServerName: string;
  maxBytes: number;
  timeoutMs: number;
  deadlineAt: number;
  signal: AbortSignal;
  quarantineKey: string;
}>;
export type SafeFetchTransportResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string | undefined>>;
  bytes: number;
  sha256: string;
  receipt?: SafeFetchQuarantineReceipt;
}>;
export interface SafeFetchTransport {
  request(input: SafeFetchTransportRequest, sink: SafeFetchQuarantineSink): Promise<SafeFetchTransportResponse>;
}
export interface RuntimeSafeFetchProxy {
  fetch(request: RuntimeSafeFetchRequest, sink: SafeFetchQuarantineSink): Promise<RuntimeSafeFetchResult>;
}
export type NodeHttpsRequest = (
  options: RequestOptions,
  onResponse: (response: IncomingMessage) => void,
) => ClientRequest;

export class SafeFetchTransportError extends Error {
  constructor(readonly code: "SAFE_FETCH_TIMEOUT" | "SAFE_FETCH_RESPONSE_TOO_LARGE" | "SAFE_FETCH_TRANSPORT_REJECTED") {
    super(code);
    this.name = "SafeFetchTransportError";
  }
}

function parseIpv4(address: string): readonly number[] | undefined {
  if (isIP(address) !== 4) return undefined;
  return address.split(".").map((part) => Number(part));
}

function parseIpv6(address: string): Uint8Array | undefined {
  if (isIP(address) !== 6) return undefined;
  const halves = address.toLowerCase().split("::");
  if (halves.length > 2) return undefined;
  const words = (part: string) => (part ? part.split(":") : []);
  const expandIpv4 = (parts: string[]) => {
    const final = parts.at(-1);
    if (!final?.includes(".")) return parts;
    const ipv4 = parseIpv4(final);
    return ipv4
      ? [...parts.slice(0, -1), ((ipv4[0]! << 8) | ipv4[1]!).toString(16), ((ipv4[2]! << 8) | ipv4[3]!).toString(16)]
      : undefined;
  };
  const left = expandIpv4(words(halves[0] ?? ""));
  const right = expandIpv4(words(halves[1] ?? ""));
  if (!left || !right) return undefined;
  const existing = left.length + right.length;
  if (existing > 8 || (halves.length === 1 && existing !== 8)) return undefined;
  const groups = [...left, ...Array(8 - existing).fill("0"), ...right];
  const bytes = new Uint8Array(16);
  for (let index = 0; index < groups.length; index += 1) {
    const value = Number.parseInt(groups[index]!, 16);
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) return undefined;
    bytes[index * 2] = value >> 8;
    bytes[index * 2 + 1] = value & 0xff;
  }
  return bytes;
}

function matchesPrefix(bytes: Uint8Array, prefix: Uint8Array, bits: number): boolean {
  const requiredBytes = Math.ceil(bits / 8);
  if (prefix.length !== requiredBytes) throw new Error("SAFE_FETCH_IPV6_PREFIX_INVALID");
  for (let index = 0; index < Math.floor(bits / 8); index += 1) {
    if (bytes[index] !== prefix[index]) return false;
  }
  const remainder = bits % 8;
  return (
    remainder === 0 ||
    (bytes[Math.floor(bits / 8)]! & (0xff << (8 - remainder))) ===
      (prefix[Math.floor(bits / 8)]! & (0xff << (8 - remainder)))
  );
}

function isGlobalIpv4(address: string): boolean {
  const octets = parseIpv4(address);
  if (!octets) return false;
  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a! >= 224
  );
}

function isGlobalIpv6(address: string): boolean {
  const bytes = parseIpv6(address);
  if (!bytes) return false;
  if (matchesPrefix(bytes, Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff), 96))
    return isGlobalIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
  const specialPrefixes: readonly Readonly<{ prefix: Uint8Array; bits: number }>[] = [
    { prefix: new Uint8Array(16), bits: 128 },
    { prefix: Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1), bits: 128 },
    { prefix: new Uint8Array(12), bits: 96 },
    { prefix: Uint8Array.of(0xfc), bits: 7 },
    { prefix: Uint8Array.of(0xfe, 0x80), bits: 10 },
    { prefix: Uint8Array.of(0xff), bits: 8 },
    { prefix: Uint8Array.of(0x01, 0x00, 0, 0, 0, 0, 0, 0), bits: 64 },
    { prefix: Uint8Array.of(0x01, 0x00, 0, 0, 0, 0, 0, 1), bits: 64 },
    { prefix: Uint8Array.of(0x20, 0x01, 0, 0x02, 0, 0), bits: 48 },
    { prefix: Uint8Array.of(0x20, 0x01, 0x0d, 0xb8), bits: 32 },
    { prefix: Uint8Array.of(0x20, 0x01, 0, 0x10), bits: 28 },
    { prefix: Uint8Array.of(0x20, 0x01, 0, 0x20), bits: 28 },
    { prefix: Uint8Array.of(0x20, 0x02), bits: 16 },
    { prefix: Uint8Array.of(0x3f, 0xff, 0), bits: 20 },
    { prefix: Uint8Array.of(0, 0x64, 0xff, 0x9b, 0, 1), bits: 48 },
  ];
  return !specialPrefixes.some(({ prefix, bits }) => matchesPrefix(bytes, prefix, bits));
}

/** Policy-only helper. Runtime traffic must flow through createSafeFetchProxy. */
export function isGlobalUnicastIp(address: string): boolean {
  return isIP(address) === 4 ? isGlobalIpv4(address) : isIP(address) === 6 && isGlobalIpv6(address);
}

function isUsableResolvedAddress(item: ResolvedAddress): boolean {
  return isIP(item.address) === item.family && isGlobalUnicastIp(item.address);
}

function validateUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false as const, reason: "SAFE_FETCH_NON_HTTPS_PROTOCOL" };
  }
  if (url.protocol !== "https:") return { ok: false as const, reason: "SAFE_FETCH_NON_HTTPS_PROTOCOL" };
  if (!url.hostname.includes(".") || url.username || url.password)
    return { ok: false as const, reason: "SAFE_FETCH_HOST_NOT_FQDN" };
  if (url.port && url.port !== "443") return { ok: false as const, reason: "SAFE_FETCH_PORT_REJECTED" };
  return { ok: true as const, url };
}

/** Policy/test validator. It never resolves DNS or opens a production connection. */
export function validateSafeFetchRequest(request: SafeFetchRequest): SafeFetchResult {
  if (request.caller && request.caller !== "media-worker")
    return { allow: false, reason: "SAFE_FETCH_MEDIA_WORKER_ONLY" };
  if (request.maxBytes <= 0 || request.maxBytes > 500_000_000)
    return { allow: false, reason: "SAFE_FETCH_SIZE_LIMIT_INVALID" };
  if ((request.responseBytes ?? 0) > request.maxBytes) return { allow: false, reason: "SAFE_FETCH_RESPONSE_TOO_LARGE" };
  if (request.timeoutMs <= 0 || request.timeoutMs > 30_000)
    return { allow: false, reason: "SAFE_FETCH_TIMEOUT_INVALID" };
  const initial = validateUrl(request.url);
  if (!initial.ok) return { allow: false, reason: initial.reason };
  if (request.tlsServerName && request.tlsServerName !== initial.url.hostname)
    return { allow: false, reason: "SAFE_FETCH_TLS_HOST_MISMATCH" };
  const pinned = request.resolvedAddresses.find(isUsableResolvedAddress);
  if (!pinned) return { allow: false, reason: "SAFE_FETCH_NO_PUBLIC_ADDRESS" };
  if (request.resolvedAddresses.some((item) => !isUsableResolvedAddress(item)))
    return { allow: false, reason: "SAFE_FETCH_PRIVATE_ADDRESS" };
  let finalUrl = request.url;
  let pinnedIp = pinned.address;
  let tlsServerName = initial.url.hostname;
  for (const redirect of request.redirects ?? []) {
    const parsed = validateUrl(redirect.url);
    if (!parsed.ok) return { allow: false, reason: "SAFE_FETCH_REDIRECT_UNSAFE_PROTOCOL" };
    if (
      redirect.resolvedAddresses.length === 0 ||
      redirect.resolvedAddresses.some((item) => !isUsableResolvedAddress(item))
    )
      return { allow: false, reason: "SAFE_FETCH_REDIRECT_PRIVATE_ADDRESS" };
    if (redirect.tlsServerName && redirect.tlsServerName !== parsed.url.hostname)
      return { allow: false, reason: "SAFE_FETCH_TLS_HOST_MISMATCH" };
    finalUrl = redirect.url;
    pinnedIp = redirect.resolvedAddresses[0]!.address;
    tlsServerName = parsed.url.hostname;
  }
  return { allow: true, pinnedIp, finalUrl, tlsServerName };
}

/** Policy/test-only sink contract. Production callers use RuntimeSafeFetchProxy. */
export async function safeFetchToQuarantine(
  request: SafeFetchRequest,
  sink: (accepted: {
    url: string;
    pinnedIp: string;
    tlsServerName: string;
    maxBytes: number;
  }) => Promise<{ bytes: number; sha256: string }>,
) {
  const decision = validateSafeFetchRequest(request);
  if (!decision.allow) return decision;
  const written = await sink({
    url: decision.finalUrl,
    pinnedIp: decision.pinnedIp,
    tlsServerName: decision.tlsServerName,
    maxBytes: request.maxBytes,
  });
  if (written.bytes > request.maxBytes) return { allow: false as const, reason: "SAFE_FETCH_RESPONSE_TOO_LARGE" };
  return { ...decision, ...written };
}

export function createNodeHttpsTransport(
  dependencies: Readonly<{
    request?: NodeHttpsRequest;
    now?: () => number;
    setTimeout?: typeof setTimeout;
    clearTimeout?: typeof clearTimeout;
    cleanupTimeoutMs?: number;
  }> = {},
): SafeFetchTransport {
  const send: NodeHttpsRequest = dependencies.request ?? ((options, onResponse) => httpsRequest(options, onResponse));
  const now = dependencies.now ?? Date.now;
  const schedule = dependencies.setTimeout ?? setTimeout;
  const cancel = dependencies.clearTimeout ?? clearTimeout;
  const cleanupTimeoutMs = dependencies.cleanupTimeoutMs ?? 1_000;
  if (!Number.isSafeInteger(cleanupTimeoutMs) || cleanupTimeoutMs <= 0 || cleanupTimeoutMs > 5_000)
    throw new Error("SAFE_FETCH_CLEANUP_TIMEOUT_INVALID");
  return {
    request(input, sink) {
      const url = new URL(input.url);
      const family = isIP(input.pinnedIp) as 4 | 6;
      return new Promise<SafeFetchTransportResponse>((resolve, reject) => {
        let settled = false;
        let client: ClientRequest | undefined;
        let activeResponse: IncomingMessage | undefined;
        let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
        const operationController = new AbortController();
        const operationContext: SafeFetchOperationContext = {
          signal: operationController.signal,
          deadlineAt: input.deadlineAt,
        };
        const timeoutError = () => new SafeFetchTransportError("SAFE_FETCH_TIMEOUT");
        const runSinkOperation = async <T>(operation: () => Promise<T>): Promise<T> => {
          if (operationContext.signal.aborted || now() >= input.deadlineAt) throw timeoutError();
          const remainingMs = input.deadlineAt - now();
          let operationTimer: ReturnType<typeof setTimeout> | undefined;
          const operationPromise = Promise.resolve().then(operation);
          const operationDeadline = new Promise<never>((_resolve, deadlineReject) => {
            operationTimer = schedule(() => {
              operationController.abort(timeoutError());
              deadlineReject(timeoutError());
            }, remainingMs);
          });
          try {
            return await Promise.race([operationPromise, operationDeadline]);
          } finally {
            if (operationTimer) cancel(operationTimer);
          }
        };
        const finish = (callback: () => void) => {
          if (settled) return;
          settled = true;
          if (deadlineTimer) cancel(deadlineTimer);
          input.signal.removeEventListener("abort", abortOnSignal);
          callback();
        };
        const startSinkCleanup = (error: SafeFetchTransportError) => {
          const cleanupController = new AbortController();
          const cleanupContext: SafeFetchOperationContext = {
            signal: cleanupController.signal,
            deadlineAt: now() + cleanupTimeoutMs,
          };
          let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
          const cleanupDeadline = new Promise<never>((_resolve, cleanupReject) => {
            cleanupTimer = schedule(() => {
              cleanupController.abort(timeoutError());
              cleanupReject(timeoutError());
            }, cleanupTimeoutMs);
          });
          const cleanup = Promise.resolve().then(() => sink.abort(input.quarantineKey, error.code, cleanupContext));
          void Promise.race([cleanup, cleanupDeadline])
            .catch(() => undefined)
            .finally(() => {
              if (cleanupTimer) cancel(cleanupTimer);
            });
        };
        const abort = (error: SafeFetchTransportError, response?: IncomingMessage) => {
          if (settled) return;
          response?.destroy(error);
          client?.destroy(error);
          operationController.abort(error);
          startSinkCleanup(error);
          finish(() => reject(error));
        };
        const abortOnSignal = () => abort(new SafeFetchTransportError("SAFE_FETCH_TIMEOUT"), activeResponse);
        const remainingMs = input.deadlineAt - now();
        if (remainingMs <= 0) {
          abort(new SafeFetchTransportError("SAFE_FETCH_TIMEOUT"));
          return;
        }
        if (input.signal.aborted) {
          abortOnSignal();
          return;
        }
        input.signal.addEventListener("abort", abortOnSignal, { once: true });
        deadlineTimer = schedule(() => {
          operationController.abort(timeoutError());
          abort(timeoutError(), activeResponse);
        }, remainingMs);
        const lookup: NonNullable<RequestOptions["lookup"]> = (_hostname, _options, callback) =>
          callback(null, input.pinnedIp, family);
        client = send(
          {
            agent: false,
            hostname: url.hostname,
            lookup,
            method: "GET",
            path: `${url.pathname}${url.search}`,
            port: url.port ? Number(url.port) : 443,
            rejectUnauthorized: true,
            servername: input.tlsServerName,
            timeout: remainingMs,
          },
          (response) => {
            activeResponse = response;
            let bytes = 0;
            const hash = createHash("sha256");
            const status = response.statusCode ?? 0;
            const headers = Object.fromEntries(
              Object.entries(response.headers).map(([key, value]) => [
                key,
                Array.isArray(value) ? value.join(",") : value,
              ]),
            );
            const writeToQuarantine = status >= 200 && status < 300;
            response.on("aborted", () => abort(new SafeFetchTransportError("SAFE_FETCH_TRANSPORT_REJECTED"), response));
            response.on("error", () => abort(new SafeFetchTransportError("SAFE_FETCH_TRANSPORT_REJECTED"), response));
            if (!writeToQuarantine) {
              response.destroy();
              finish(() => resolve({ status, headers, bytes: 0, sha256: `sha256:${hash.digest("hex")}` }));
              return;
            }
            response.pause();
            let writePending = false;
            let activeWrite = runSinkOperation(() => sink.open(input.quarantineKey, operationContext));
            response.on("data", (chunk: Buffer) => {
              response.pause();
              if (writePending) {
                abort(new SafeFetchTransportError("SAFE_FETCH_TRANSPORT_REJECTED"), response);
                return;
              }
              writePending = true;
              bytes += chunk.length;
              if (bytes > input.maxBytes) {
                activeWrite = Promise.reject(new SafeFetchTransportError("SAFE_FETCH_RESPONSE_TOO_LARGE"));
              } else {
                hash.update(chunk);
                activeWrite = runSinkOperation(() => sink.write(input.quarantineKey, chunk, operationContext));
              }
              void activeWrite.then(
                () => {
                  writePending = false;
                  if (!settled) response.resume();
                },
                (error: unknown) =>
                  abort(
                    error instanceof SafeFetchTransportError
                      ? error
                      : new SafeFetchTransportError("SAFE_FETCH_TRANSPORT_REJECTED"),
                    response,
                  ),
              );
            });
            response.on("end", () => {
              void activeWrite.then(
                async () => {
                  if (settled) return;
                  const sha256 = `sha256:${hash.digest("hex")}`;
                  try {
                    const receipt = await runSinkOperation(() =>
                      sink.complete(
                        input.quarantineKey,
                        {
                          url: input.url,
                          pinnedIp: input.pinnedIp,
                          tlsServerName: input.tlsServerName,
                          bytes,
                          sha256,
                        },
                        operationContext,
                      ),
                    );
                    if (settled || operationContext.signal.aborted) return;
                    finish(() => resolve({ status, headers, bytes, sha256, receipt }));
                  } catch (error) {
                    abort(
                      error instanceof SafeFetchTransportError
                        ? error
                        : new SafeFetchTransportError("SAFE_FETCH_TRANSPORT_REJECTED"),
                      response,
                    );
                  }
                },
                () => undefined,
              );
            });
            void activeWrite.then(
              () => response.resume(),
              (error: unknown) =>
                abort(
                  error instanceof SafeFetchTransportError
                    ? error
                    : new SafeFetchTransportError("SAFE_FETCH_TRANSPORT_REJECTED"),
                  response,
                ),
            );
          },
        );
        client.once("error", (error: Error) =>
          abort(
            error instanceof SafeFetchTransportError
              ? error
              : new SafeFetchTransportError("SAFE_FETCH_TRANSPORT_REJECTED"),
            activeResponse,
          ),
        );
        client.setTimeout(remainingMs, () => abort(new SafeFetchTransportError("SAFE_FETCH_TIMEOUT"), activeResponse));
        client.end();
      });
    },
  };
}

function validateRuntimeRequest(request: RuntimeSafeFetchRequest): { ok: true } | { ok: false; reason: string } {
  if (request.caller && request.caller !== "media-worker") return { ok: false, reason: "SAFE_FETCH_MEDIA_WORKER_ONLY" };
  if (request.maxBytes <= 0 || request.maxBytes > 500_000_000)
    return { ok: false, reason: "SAFE_FETCH_SIZE_LIMIT_INVALID" };
  if (request.timeoutMs <= 0 || request.timeoutMs > 30_000) return { ok: false, reason: "SAFE_FETCH_TIMEOUT_INVALID" };
  return { ok: true };
}

/** Runtime SafeFetch owns DNS, pinning, redirects, TLS hostname handling, and byte/time limits. */
export function createSafeFetchProxy(
  dependencies: Readonly<{
    resolve: SafeFetchResolver["resolve"];
    request: SafeFetchTransport["request"];
    maxRedirects?: number;
    now?: () => number;
    setTimeout?: typeof setTimeout;
    clearTimeout?: typeof clearTimeout;
  }>,
): RuntimeSafeFetchProxy {
  const now = dependencies.now ?? Date.now;
  const schedule = dependencies.setTimeout ?? setTimeout;
  const cancel = dependencies.clearTimeout ?? clearTimeout;
  return {
    async fetch(request, sink) {
      const requestValidity = validateRuntimeRequest(request);
      if (!requestValidity.ok) return { allow: false, reason: requestValidity.reason };
      if (!request.quarantineKey) return { allow: false, reason: "SAFE_FETCH_QUARANTINE_KEY_INVALID" };
      const initial = validateUrl(request.url);
      if (!initial.ok) return { allow: false, reason: initial.reason };
      const deadlineAt = now() + request.timeoutMs;
      const controller = new AbortController();
      let timeoutReject: ((error: SafeFetchTransportError) => void) | undefined;
      const timedOut = new Promise<never>((_resolve, reject) => {
        timeoutReject = reject;
      });
      const deadlineTimer = schedule(() => {
        controller.abort();
        timeoutReject?.(new SafeFetchTransportError("SAFE_FETCH_TIMEOUT"));
      }, request.timeoutMs);
      const beforeDeadline = async <T>(operation: () => Promise<T>): Promise<T> => {
        if (now() >= deadlineAt) throw new SafeFetchTransportError("SAFE_FETCH_TIMEOUT");
        return Promise.race([operation(), timedOut]);
      };
      let url = initial.url;
      const maxRedirects = dependencies.maxRedirects ?? 5;
      try {
        for (let hop = 0; hop <= maxRedirects; hop += 1) {
          const urlValidity = validateUrl(url.toString());
          if (!urlValidity.ok)
            return { allow: false, reason: hop === 0 ? urlValidity.reason : "SAFE_FETCH_REDIRECT_UNSAFE_PROTOCOL" };
          const first = await beforeDeadline(() =>
            dependencies.resolve(url.hostname, { signal: controller.signal, deadlineAt }),
          );
          const privateAddressReason =
            hop === 0 ? "SAFE_FETCH_NO_PUBLIC_ADDRESS" : "SAFE_FETCH_REDIRECT_PRIVATE_ADDRESS";
          if (first.length === 0 || first.some((item) => !isUsableResolvedAddress(item)))
            return { allow: false, reason: privateAddressReason };
          const pinnedIp = first[0]!.address;
          const second = await beforeDeadline(() =>
            dependencies.resolve(url.hostname, { signal: controller.signal, deadlineAt }),
          );
          if (
            second.some((item) => !isUsableResolvedAddress(item)) ||
            !second.some((item) => item.address === pinnedIp)
          )
            return { allow: false, reason: "SAFE_FETCH_DNS_REBIND" };
          const response = await beforeDeadline(() =>
            dependencies.request(
              {
                url: url.toString(),
                pinnedIp,
                tlsServerName: url.hostname,
                maxBytes: request.maxBytes,
                timeoutMs: Math.max(0, deadlineAt - now()),
                deadlineAt,
                signal: controller.signal,
                quarantineKey: request.quarantineKey,
              },
              sink,
            ),
          );
          if (response.bytes > request.maxBytes) return { allow: false, reason: "SAFE_FETCH_RESPONSE_TOO_LARGE" };
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.location;
            if (!location || hop === maxRedirects) return { allow: false, reason: "SAFE_FETCH_REDIRECT_LIMIT" };
            try {
              url = new URL(location, url);
            } catch {
              return { allow: false, reason: "SAFE_FETCH_REDIRECT_UNSAFE_PROTOCOL" };
            }
            continue;
          }
          if (response.status < 200 || response.status >= 300)
            return { allow: false, reason: "SAFE_FETCH_HTTP_STATUS_REJECTED" };
          if (!response.receipt) return { allow: false, reason: "SAFE_FETCH_QUARANTINE_RECEIPT_MISSING" };
          return {
            allow: true,
            pinnedIp,
            finalUrl: url.toString(),
            tlsServerName: url.hostname,
            bytes: response.bytes,
            sha256: response.sha256,
            receipt: response.receipt,
          };
        }
      } catch (error) {
        return {
          allow: false,
          reason: error instanceof SafeFetchTransportError ? error.code : "SAFE_FETCH_TRANSPORT_REJECTED",
        };
      } finally {
        cancel(deadlineTimer);
      }
      return { allow: false, reason: "SAFE_FETCH_REDIRECT_LIMIT" };
    },
  };
}
