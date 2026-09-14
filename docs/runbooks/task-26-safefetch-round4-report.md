# Task 26 SafeFetch C4 Round 4 Report

Date: 2026-08-28 Asia/Shanghai

Scope was limited to the two outstanding SafeFetch C4 findings: absolute-deadline enforcement for every quarantine sink operation and a concrete production S3-compatible conditional quarantine sink. No commit, credential, Task 00 evidence, reset, or workspace cleanup was performed.

## Root Cause

The Node transport passed `signal` and `deadlineAt` to `open`, `write`, `complete`, and `abort`, but did not control those promises with their remaining absolute budget. The transport-owned deadline could reject the request while a sink still saw a non-aborted signal, and a stalled `abort` could delay settlement. In particular, a late `complete` implementation could continue after the request deadline.

Media production composition also accepted any object with sink-shaped methods. The interface described conditional behavior but there was no production adapter that implemented an object-store compare-and-set, nor a nominal production guard.

## RED Evidence

The tests were added before implementation and this command failed as intended:

```powershell
corepack pnpm --filter @comic-canvas/storage test -- safe-fetch-proxy.test.ts
```

Vitest reported 6 failures and 24 passes. The `open`, `write`, and `complete` contexts were not aborted at deadline; a stalled `abort` did not produce the required controlled rejection; and both S3 tests failed because `S3ConditionalQuarantineSink` did not exist.

## Implementation

- The Node transport now creates one operation context for the request. Every sink operation receives the same `AbortSignal` and `deadlineAt` and is raced against the remaining absolute budget. The deadline aborts that shared signal. Cleanup `abort` is invoked with the same already-aborted context and cannot delay request settlement.
- A sink completion result is ignored after the transport is settled or its shared signal is aborted. Consequently, a completion cannot turn a timed-out request into a successful quarantine receipt.
- `S3ConditionalQuarantineSink` uses AWS SDK multipart upload. It buffers at most one configurable part, with a production default and minimum of 5 MiB, and uploads each full part before accepting more bytes. It therefore never accumulates the allowed 500 MB response in memory. Aside from the current transport chunk, its retained byte buffer is bounded by 5 MiB plus small part metadata.
- The database-owned key is validated as `quarantine/provider-output/<instruction-id>` and is used unchanged as the S3 object key. Retries therefore address the same object.
- Multipart initiation requests full-object SHA-256. Every part carries a SHA-256 checksum. Finalization supplies `If-None-Match: *`, `ChecksumType: FULL_OBJECT`, full-object SHA-256, and exact object size.
- After a successful completion, the sink performs `HeadObject` with checksum mode enabled and accepts the receipt only when `ContentLength` and `ChecksumSHA256` match the streamed result.
- If conditional completion loses a race, or the completion response is ambiguous, the sink does not blindly finalize again. It performs the same Head reconciliation. An existing object is idempotently accepted only when both byte length and full SHA-256 match; otherwise the operation is rejected and the incomplete multipart upload is aborted where the remaining deadline permits.
- Every S3 command receives the operation `AbortSignal`, including initial/final Head, multipart create, part upload, conditional complete, and abort.
- Media keeps its existing narrow package boundary. Production dependency validation now requires the concrete adapter's nominal production identity, conditional capability, prototype constructor identity, and complete sink contract. Generic, in-memory, and nonconditional sink shapes are rejected. The independent cross-package TypeScript contract proves that the exported storage adapter satisfies the Media port.

## Coverage

Tests cover:

- stalled `open`, `write`, `complete`, and `abort` operations;
- one shared aborted signal across all sink operations;
- no finalization after a completion deadline;
- deterministic S3 object keys and conditional multipart completion;
- exact checksum and byte-length validation for existing objects;
- idempotent acceptance of a matching competing finalization and rejection of different bytes;
- propagation of the same abort signal into every S3 command;
- production acceptance of the concrete adapter and rejection of generic or test adapters.

## Final Verification

```powershell
corepack pnpm --filter @comic-canvas/storage test -- safe-fetch.test.ts safe-fetch-proxy.test.ts
corepack pnpm --filter @comic-canvas/worker-media test -- ingest-provider-output.test.ts safe-fetch-port.contract.test.ts postgres-provider-output-ingest-receipts.test.ts bootstrap.test.ts
.\node_modules\.bin\tsc.cmd -p apps/worker-media/test/tsconfig.safe-fetch-port.json --noEmit
corepack pnpm --filter @comic-canvas/storage typecheck
corepack pnpm --filter @comic-canvas/worker-media typecheck
corepack pnpm format:check
corepack pnpm lint
```

Final rerun results are recorded after the commands complete: Storage 5 files / 31 tests, Media 7 files / 9 tests, cross-package contract compile exit 0, both package typechecks exit 0, Prettier exit 0, and ESLint exit 0.

## Round 5 Correction

Date: 2026-08-28 Asia/Shanghai

Round 5 supersedes the Round 4 multipart-checksum, cleanup-signal, and completion-finality claims. AWS S3 does not support SHA-256 as a multipart `FULL_OBJECT` checksum: SHA-256 multipart checksums are `COMPOSITE`, so comparing `HeadObject.ChecksumSHA256` with the original whole-object SHA-256 was incorrect. An abort request using the already-cancelled main operation signal was also not a cleanup attempt, and a client-side deadline cannot prove that S3 did not physically commit a `CompleteMultipartUpload` request.

No commit, credential, reset, cleanup, or Task 00 evidence operation was performed in Round 5.

### Round 5 Root Cause

- The S3 adapter declared `ChecksumAlgorithm: SHA256` together with `ChecksumType: FULL_OBJECT` and supplied the original SHA-256 to `CompleteMultipartUpload`. Real AWS requires SHA-256 multipart uploads to use `COMPOSITE`; the Head checksum therefore cannot be compared with the original full-object digest.
- The Node transport resumed the response after `open` but did not pause it in each `data` callback. Promise-chaining serialized sink writes but retained every queued response chunk, allowing a slow sink to accumulate nearly the entire 500 MB response.
- The transport aborted the shared operation controller before calling `sink.abort` with that controller's signal. The S3 adapter rejected the context before sending `AbortMultipartUpload`, while also deleting session state in paths that could prevent a later retry.
- `CompleteMultipartUpload` and the absolute deadline can race after the request reaches S3. The transport can prevent a late Promise from returning success, but it cannot undo or disprove a physical commit. Recovery must use the deterministic quarantine key on a later attempt.
- Media accepted publicly forgeable capability strings and `constructor.name`. Those properties establish shape, not production identity.

### Round 5 RED Evidence

Tests were changed before implementation. The storage focused command failed with 9 failures and 24 passes across 33 tests. The controlled 500 MB simulation measured 500 outstanding chunks while the first sink write was stalled; cleanup received the same already-aborted signal; the realistic S3 mock rejected SHA-256 `FULL_OBJECT`; existing-object and conditional-conflict reconciliation failed; and the late-commit path did not send a usable multipart abort.

```powershell
corepack pnpm --filter @comic-canvas/storage test -- safe-fetch.test.ts safe-fetch-proxy.test.ts
```

The worker focused command failed with 1 failure and 9 passes across 10 tests because production composition still accepted an attested sink without requiring the injected storage checker. The new receipt-fencing test already passed: a timed-out first attempt called receipt failure without completion, while the reconciled retry completed once.

```powershell
corepack pnpm --filter @comic-canvas/worker-media test -- ingest-provider-output.test.ts safe-fetch-port.contract.test.ts postgres-provider-output-ingest-receipts.test.ts bootstrap.test.ts
```

The independent review found that treating any HTTP 404 from `AbortMultipartUpload` as `NoSuchUpload` could discard cleanup state on `NoSuchBucket` or endpoint failures. A directed regression first failed because the 404 was swallowed, then passed after the adapter was restricted to explicit `name` or `Code` values of `NoSuchUpload`.

A final independent guard review found that placing `attestQuarantineSink` beside the sink in caller-controlled dependencies still allowed `genericSink` plus `() => true` to bypass production validation. The lying-attestor regression failed with 1 worker failure and 9 passes before the attestor field was removed from the dependency contract and the verifier was pinned at the worker module boundary.

### Round 5 Implementation

- Every successful-response `data` callback now pauses the `IncomingMessage` synchronously. The transport retains one active chunk/write, resumes only after `sink.write` settles, and rejects a response that violates the one-write invariant. A 500-chunk test models the 500 MB limit with 1 MB chunks and proves the maximum outstanding count is one during a stalled first write.
- Main request cancellation and cleanup are separate contexts. Main settlement aborts the operation signal, starts `sink.abort` in the background with a fresh controller and a fixed cleanup deadline (default 1 second, configurable only within 1-5000 ms), and rejects without waiting for cleanup. A stalled cleanup is cancelled by its own timer.
- The S3 adapter now initiates and completes SHA-256 multipart uploads with `ChecksumType: COMPOSITE`. Every part supplies its locally computed SHA-256, completed-part metadata uses that checksum, and successful completion is verified by exact object length, `ChecksumType: COMPOSITE`, and the locally computed SHA-256 checksum-of-part-digests.
- The upload session owns one reusable 5 MiB part buffer. It does not accumulate response-sized buffers and does not duplicate the part with `Buffer.concat` at flush time.
- Existing deterministic keys and ambiguous/conditional completion failures use `GetObject` only on the reconciliation path. The Body is consumed as an async iterable, incrementally counted and SHA-256 hashed, and is accepted only when both the streamed byte length and original full-object SHA-256 match the just-fetched source.
- A timed-out completion never returns a receipt. If S3 physically commits later, the next attempt opens the same database-owned key, streams the source again, streams the existing object for comparison, and accepts it without another `CompleteMultipartUpload`.
- Multipart state is removed only after successful abort, `NoSuchUpload`, verified completion, or a no-MPU existing-object path. Failed cleanup remains registered; a later `open` retries `AbortMultipartUpload` before creating another MPU.
- Storage registers every real `S3ConditionalQuarantineSink` in a module-private `WeakSet`. Its narrow `safe-fetch-attestation` package subpath exports only a production factory and verifier; the private registration capability is not exported. Media imports that verifier directly at its module boundary and no longer accepts an attestor in caller-controlled dependencies. A narrow declaration export avoids pulling storage source under the worker `rootDir`, while the runtime export and production factory share the same module-local WeakSet. Public strings, constructor names, and caller-supplied verifier functions are not consulted.

### Round 5 Coverage

- one-chunk transport backpressure across a simulated 500 MB response;
- fresh, bounded cleanup context and immediate main-request settlement;
- actual `AbortMultipartUpload` invocation with a non-aborted cleanup signal;
- failed MPU cleanup retained and retried on the next open;
- AWS-compatible SHA-256 `COMPOSITE` create/complete requests and composite Head verification;
- streaming existing-object original SHA-256 and length matching without full-object buffering;
- matching and conflicting conditional-finalize reconciliation;
- late physical commit rejected in the current attempt and accepted on retry without a second finalize;
- receipt completion fenced until the reconciled retry;
- real WeakSet-attested production-factory adapter accepted; forged public identity, generic adapters, and a caller-supplied lying attestor rejected.

### Round 5 Final Verification

```powershell
corepack pnpm --filter @comic-canvas/storage test -- safe-fetch.test.ts safe-fetch-proxy.test.ts
corepack pnpm --filter @comic-canvas/worker-media test -- ingest-provider-output.test.ts safe-fetch-port.contract.test.ts postgres-provider-output-ingest-receipts.test.ts bootstrap.test.ts
.\node_modules\.bin\tsc.cmd -p apps/worker-media/test/tsconfig.safe-fetch-port.json --noEmit
corepack pnpm --filter @comic-canvas/storage typecheck
corepack pnpm --filter @comic-canvas/worker-media typecheck
corepack pnpm --filter @comic-canvas/storage build
corepack pnpm --filter @comic-canvas/worker-media build
corepack pnpm format:check
corepack pnpm lint
```

The complete post-review rerun passed: Storage 5 files / 34 tests, Media 7 files / 10 tests, cross-package contract compile exit 0, both package typechecks and builds exit 0, production attestation dist smoke exit 0, Prettier exit 0, and ESLint exit 0.

### Production Export Follow-up

The final runtime smoke was strengthened to import the package subpath exactly as the compiled Media Worker does. The package export now resolves the attestation source only under the development condition and resolves `dist/safe-fetch-attestation.js` by default. This prevents a production Node process from loading `src/safe-fetch-attestation.ts` and then failing to resolve its `.js` dependency from the source directory.
