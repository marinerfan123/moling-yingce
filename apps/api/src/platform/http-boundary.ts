export type ForwardedHeaders = {
  "x-forwarded-for"?: string;
  "x-forwarded-host"?: string;
  "x-forwarded-proto"?: string;
};

export function normalizeForwardedHeaders(input: ForwardedHeaders, trustedProxyHops: number): ForwardedHeaders {
  if (trustedProxyHops < 1) return {};
  const output: ForwardedHeaders = {};
  if (input["x-forwarded-for"]) output["x-forwarded-for"] = input["x-forwarded-for"];
  if (input["x-forwarded-host"]) output["x-forwarded-host"] = input["x-forwarded-host"];
  if (input["x-forwarded-proto"]) output["x-forwarded-proto"] = input["x-forwarded-proto"];
  return output;
}

export function isRawBodyWebhookPath(path: string) {
  return path === "/v1/webhooks/provider";
}

export const MAX_PROVIDER_WEBHOOK_BYTES = 1_000_000;

export async function readBoundedRawBody(
  chunks: AsyncIterable<Uint8Array>,
  maxBytes = MAX_PROVIDER_WEBHOOK_BYTES,
): Promise<Uint8Array> {
  const collected: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of chunks) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new Error("WEBHOOK_RAW_BODY_TOO_LARGE");
    collected.push(chunk);
  }
  const raw = new Uint8Array(size);
  let offset = 0;
  for (const chunk of collected) {
    raw.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return raw;
}
