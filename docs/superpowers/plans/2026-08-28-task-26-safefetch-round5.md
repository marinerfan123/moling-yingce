# Task 26 SafeFetch C4 Round 5 Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with a RED/GREEN cycle. Do not commit, clean the workspace, or write credentials.

**Goal:** Make SafeFetch multipart integrity, response backpressure, deadline cleanup, ambiguous completion recovery, and production sink identity correct under real AWS S3 and Node stream semantics.

**Architecture:** Keep the normal upload path bounded to one 5 MiB multipart part and use AWS-supported SHA-256 `COMPOSITE` checksums. Treat an existing deterministic quarantine key as a rare reconciliation path: stream it through `GetObject` and independently recompute the original full-object SHA-256 and length. The transport rejects at its absolute deadline, starts MPU cleanup with a separate bounded signal, and lets a later retry reconcile a physically committed object without finalizing again.

**Tech Stack:** TypeScript 5.9, Node HTTPS streams, AWS SDK v3 S3, Vitest, pnpm.

## Global Constraints

- Add or modify tests and capture RED before implementation.
- Retain no more than one configured multipart part plus one transport response chunk.
- A deadline attempt never returns success and never advances the ingest receipt, even if S3 commits later.
- Cleanup uses an independent strictly bounded context and does not delay main-request settlement.
- Production identity must be nominal and not forgeable through public strings or `constructor.name`.
- Do not commit, clean/reset the workspace, or write credentials.

---

### Task 1: Node Response Backpressure And Cleanup Context

**Files:**
- Modify: `packages/storage/src/safe-fetch-proxy.test.ts`
- Modify: `packages/storage/src/safe-fetch.ts`

**Interfaces:**
- Consumes: `SafeFetchQuarantineSink.write()` and `.abort()`.
- Produces: per-chunk pause/write/resume sequencing and a transport-owned cleanup context with a fresh signal and fixed deadline.

- [x] Add a controlled `IncomingMessage` regression test that offers many chunks but releases the next chunk only on `resume()`, stalls each sink write, and asserts at most one chunk is outstanding.
- [x] Run the focused storage test and record the missing per-chunk pause/resume RED.
- [x] Add a deadline test asserting the main operation signal is aborted while the cleanup signal is fresh, the request rejects before cleanup settles, and cleanup signal later aborts at its own bound.
- [x] Replace the cumulative write Promise queue with one in-flight write: synchronously pause in every `data` callback, await `sink.write`, then resume only while unsettled.
- [x] Start `sink.abort` with a fresh `AbortController`, fixed cleanup deadline, and background `Promise.race`; reject the main request immediately.

### Task 2: AWS-Supported Multipart Integrity And Existing-Object Reconciliation

**Files:**
- Modify: `packages/storage/src/safe-fetch-proxy.test.ts`
- Modify: `packages/storage/src/s3-conditional-quarantine-sink.ts`

**Interfaces:**
- Consumes: AWS `CreateMultipartUpload`, `UploadPart`, `CompleteMultipartUpload`, `HeadObject`, `GetObject`, and `AbortMultipartUpload` commands.
- Produces: SHA-256 `COMPOSITE` multipart requests and streaming original SHA-256/length reconciliation.

- [x] Change the S3 mock to reject SHA-256 `FULL_OBJECT`, report `ChecksumType: "COMPOSITE"`, and expose streamed `GetObject` bodies for existing-object checks.
- [x] Add RED cases for matching and conflicting existing objects where Head metadata alone cannot prove the original digest.
- [x] Initiate and complete SHA-256 multipart uploads with `ChecksumType: "COMPOSITE"`; retain local per-part digests and validate the resulting composite checksum and exact length.
- [x] For existing or ambiguous objects, stream `GetObject.Body` as an async iterable, incrementally hash/count bytes, stop on mismatch/limit, and never buffer the object.
- [x] Retain an uncleaned MPU session after failed abort so a later `open()` can retry cleanup; treat `NoSuchUpload` as already clean.

### Task 3: Ambiguous Completion Recovery And Receipt Fencing

**Files:**
- Modify: `packages/storage/src/safe-fetch-proxy.test.ts`
- Modify: `apps/worker-media/src/processors/ingest-provider-output.test.ts`

**Interfaces:**
- Consumes: deterministic quarantine key and existing receipt-store fail/complete operations.
- Produces: current-attempt failure after deadline, next-attempt reconciliation success, and exactly one database completion.

- [x] Add a fake S3 late-commit test: completion crosses the transport deadline, the first attempt rejects, the object becomes visible later, and the second attempt validates it by streamed GET without a second `CompleteMultipartUpload`.
- [x] Add a worker regression proving a failed first SafeFetch result calls receipt failure but not completion; the reconciled retry completes the receipt exactly once.
- [x] Preserve existing worker behavior: only an `allow:true` result with a matching receipt advances the durable completion.

### Task 4: Nominal Production Sink Attestation

**Files:**
- Modify: `packages/storage/src/s3-conditional-quarantine-sink.ts`
- Modify: `packages/storage/src/safe-fetch.ts`
- Modify: `packages/storage/src/index.ts`
- Modify: `apps/worker-media/src/main.ts`
- Modify: `apps/worker-media/test/safe-fetch-port.contract.test.ts`

**Interfaces:**
- Produces: a narrow storage production subpath with factory and `isS3ConditionalQuarantineSink(value: unknown)`, backed by a storage-private `WeakSet`.
- Consumes: a verifier imported and pinned by the worker module boundary, never supplied beside dependencies by the caller.

- [x] Add a RED contract case for an object spoofing all old public fields and `constructor.name`.
- [x] Register each real adapter instance in a module-private `WeakSet` and export only the checker function.
- [x] Import and pin that checker in Media, remove caller-controlled attestation plus public-string/constructor-name checks, and expose a narrow declaration boundary that preserves the worker `rootDir`.

### Task 5: Verification And Round 5 Report

**Files:**
- Modify: `docs/runbooks/task-26-safefetch-round4-report.md`

- [x] Run storage focused tests.
- [x] Run worker-media focused tests.
- [x] Run the cross-package SafeFetch contract compile.
- [x] Run both package typechecks, `format:check`, and `lint`.
- [x] Review the final diff against all five findings and append Round 5 root cause, RED, implementation, coverage, and exact command results to the report.
