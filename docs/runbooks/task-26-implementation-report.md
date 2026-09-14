# Task 26 Implementation Report

## Scope

Implemented Task 26 provider dispatch, recovery, cancellation, verified webhook ingress, attempt billing reconciliation, opaque provider-event queues, and Media-only provider-output ingest. No Task 00 evidence was changed, no API keys or secrets were added, and no git commit/reset/cleanup was performed.

## RED Evidence

Created `apps/worker-generation/test/recovery.integration.test.ts` before the implementation. The required command was run first:

```powershell
corepack pnpm --filter @comic-canvas/worker-generation test -- recovery.integration.test.ts
```

It failed as intended with:

```text
Cannot find module '../src/job-processor.js'
```

The suite otherwise collected and passed the existing five worker test files. This confirmed the RED failure was the missing Task 26 `JobProcessor`, rather than a test/configuration error.

## Implementation

- Added durable-port-shaped `AttemptStore` and executable in-memory implementation. It creates a unique submission key, billable attempt subject and `created` Attempt before any provider network call.
- Added `JobProcessor`, recovery decisions and cancellation operations. Ambiguous submit failures enter `reconciling`; deterministic validation/permanent failures enter `failed`. Idempotency-key retry reuses the exact Attempt/submission key only when the adapter declares that mode. Client-reference replacement Attempts require authoritative `definitively_absent` recovery evidence.
- Cancellation operations deduplicate before provider I/O. `accepted` only acknowledges cancellation and leaves the Attempt running; `unknown` is persisted after transport ambiguity; `already_terminal` validates the supplied terminal status.
- Added isolated webhook verification facilities: a narrow `WebhookSecretResolver`, timestamped exact-raw-byte HMAC verification, injected atomic replay-store port, and audit on every secret resolve. API webhook routing accepts provider key plus opaque route token, reads bounded raw bytes before parsing, and exposes a verifier/secret-resolver port for runtime composition.
- Added opaque provider-event queue contracts. Payloads contain exactly `eventId`, `route`, and `payloadHash`; URLs, secrets, API-key text and injected scope are rejected. The worker local port has a contract test against the shared queue package to preserve the monorepo rootDir boundary without inventing a divergent payload shape.
- Added provider-output dispatch: URL locator stays in a scoped fetch instruction; the queue only carries opaque identifiers and hash. Generation owns no download socket. Media ingest has an explicit SafeFetch proxy port, idempotent receipt-store port, expiry refresh result, and recoverable unsafe-fetch result. Storage SafeFetch now pins the final redirect address and uses the final redirect host for TLS SNI verification.
- Added attempt-level charge reconciliation with tenant/project/reservation scope, decimal-string micros validation, provider charge idempotency, and the late-cancellation adjustment flag. Extended existing migration contracts: `generation_attempts` accepts `reconciling`; provider event uniqueness is `(provider_config_id, external_event_id)`; billing SQL now validates billable-attempt scope and writes idempotent charge evidence plus balanced debit/credit ledger movements.

## Self Audit

- Queue payloads never contain prompt, URL, tenant/project, credentials, or raw webhook data.
- Webhook pre-signature code has only route token/provider key lookup, webhook-secret reference, raw bytes and headers. Scope derives after verified receipt/Attempt bootstrap.
- No code uses floating point for billing amounts; changes use decimal micros in application interfaces and `numeric(38,0)` in SQL.
- Accepted cancellation is nonterminal. Late cancelled/billed success remains unselected and is marked for adjustment.
- SafeFetch verifies public addresses at every redirect and exposes final pinned IP plus TLS hostname to the injected network adapter.
- The local worker protocol is intentionally a narrow port because this repository's worker tsconfigs prohibit direct workspace-source imports. Its opaque queue behavior is compared with `@comic-canvas/queue` in an integration test.

## Verification

Task 26 directed checks all passed:

```powershell
corepack pnpm --filter @comic-canvas/provider-sdk test -- webhook-verifier.test.ts
corepack pnpm --filter @comic-canvas/queue test -- provider-event-queue.test.ts
corepack pnpm --filter @comic-canvas/worker-generation test -- recovery.integration.test.ts cancellation.integration.test.ts webhook.integration.test.ts provider-output-dispatch.integration.test.ts billing-reconciliation.integration.test.ts
corepack pnpm --filter @comic-canvas/worker-media test -- ingest-provider-output.test.ts transcode-cfr-mezzanine.test.ts
corepack pnpm --filter @comic-canvas/api test:e2e -- provider-webhook.e2e-spec.ts
```

The API e2e command initially hit the known Windows sandbox `Access is denied` Vite/esbuild configuration issue; the exact command passed when rerun with approved elevation (17 files, 39 tests). Additional DB provider-event/ledger/migration and storage SafeFetch checks passed.

Final global checks passed:

```powershell
corepack pnpm typecheck
corepack pnpm format:check
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm verify:workspaces
corepack pnpm verify:fixed-points
corepack pnpm verify:boundaries
```

The non-elevated full test/build commands encountered the same Vite sandbox permission error for `apps/web`; their exact elevated reruns passed. The final elevated full test ran all workspace suites successfully, and the elevated build completed all 17 package builds.

## Fix Round 1

Review-driven fixes started in this round:

- Added API, Generation Worker, and Media Worker production dependency assertions. Production startup now fails instead of silently using missing webhook, DB, queue, provider, SafeFetch, replay, or consumer ports; injected worker consumers are started.
- Added runtime `SafeFetchProxy` with injected resolver/transport, double DNS resolution before connect, redirect loop cap, exact pinned-IP transport input, hostname TLS SNI, and byte/status limits. The runtime request does not accept caller-supplied resolved addresses.
- Corrected `SECURITY DEFINER` authorization checks from `current_user` to `session_user`; updated the six-argument bootstrap function comment signature. Billing charge SQL now atomically consumes a matching reservation, decreases reserved micros while increasing spent micros, and writes late-cancellation adjustment movements.
- Strengthened JobProcessor duplicate submit/retry/recovery/cancel state guards. Recovery validates the persisted submission key and stores the external ID from `found` evidence.
- Converted SDK replay-store consumption to an asynchronous port in progress; this makes a DB/Redis atomic replay adapter possible rather than implying the process-local test store is production durable.

Fresh passing evidence in this round:

```powershell
corepack pnpm --filter @comic-canvas/storage test -- safe-fetch-proxy.test.ts
corepack pnpm --filter @comic-canvas/api test -- production-composition.test.ts
corepack pnpm --filter @comic-canvas/provider-sdk test -- webhook-verifier.test.ts
corepack pnpm --filter @comic-canvas/db test -- migration.integration.test.ts provider-event-scope.integration.test.ts
corepack pnpm --filter @comic-canvas/worker-generation test -- recovery.integration.test.ts cancellation.integration.test.ts
```

The API e2e command again hit the documented sandbox-only Vite/esbuild access denial; its approved elevated rerun passed all 17 files and 39 tests.

## Fix Round 2a

Scope was limited to review finding C3: `record_attempt_charge` scope derivation, settlement accounting, and Generation Worker billing-port coverage. No Task 00 material, secrets, API keys, git commit, reset, or cleanup action was added.

### RED Evidence

The following commands were run before the C3 implementation:

```powershell
corepack pnpm --filter @comic-canvas/db test -- attempt-charge-settlement.integration.test.ts
corepack pnpm --filter @comic-canvas/worker-generation test -- billing-reconciliation.integration.test.ts
```

The DB test failed because a full `1000` micro reservation remained reserved after a `1000` micro charge: available was `8000` instead of `9000`. Two independently reserved and charged retries similarly reported `7500` instead of `8750`. The worker test failed because two distinct generation attempts with the same provider charge ID produced one reconciliation call: its cache key still used the former billable-attempt payload field.

### Implementation And Coverage

- `app.record_attempt_charge` now accepts only `generationAttemptId`, provider charge evidence, amount/currency, and the late-cancellation flag. It derives tenant, project, job, billable attempt, reservation, policy, and budget scope through locked `generation_attempts`, `billable_attempts`, and `usage_reservations` rows.
- The generation-attempt ID is globally unique, so the security-definer entry point cannot ambiguously resolve a tenant/project pair. Reservation, billable attempt, job, tenant, and project agreement is required before settlement.
- Normal settlement reduces `reserved_micros` and increases `spent_micros` by the same amount. Exact provider-charge replay returns the original movement; differing evidence, amount, currency, or billable attempt is rejected as immutable. Debit/credit movements are balanced and reference the derived reservation and billable attempt.
- A canceled late bill consumes previously released reservation capacity, records `cancellation_late_bill_adjustment` with `late_cancellation_bill`, increments spend without restoring a hold, and does not read or mutate selections.
- `SECURITY DEFINER` authorization uses `session_user`; the six-argument function is revoked from public and granted only to `comic_generation_worker`.
- New executable accounting tests cover full-reserve settlement, two separate retry settlements, exact replay, and immutable provider-charge conflicts. Migration verification checks the function contract and relation joins in addition to the executable accounting coverage. Worker coverage confirms its DB-port payload has no tenant, project, reservation, billable-attempt, or cancellation field and distinct generation attempts remain distinct.

### GREEN Evidence

```powershell
corepack pnpm --filter @comic-canvas/db test -- attempt-charge-settlement.integration.test.ts migration.integration.test.ts ledger.integration.test.ts
corepack pnpm --filter @comic-canvas/worker-generation test -- billing-reconciliation.integration.test.ts
corepack pnpm --filter @comic-canvas/db typecheck
corepack pnpm --filter @comic-canvas/worker-generation typecheck
```

All four commands passed: the DB suite reported 19 files / 41 tests; the worker suite reported 11 files / 14 tests. A live PostgreSQL/testcontainer runtime is not configured in this workspace, so the evidence does not claim execution against a database server; it combines migration-contract verification with the executable settlement model.

### Final Verification

```powershell
corepack pnpm --filter @comic-canvas/db test -- attempt-charge-settlement.integration.test.ts migration.integration.test.ts ledger.integration.test.ts
corepack pnpm --filter @comic-canvas/worker-generation test -- billing-reconciliation.integration.test.ts
corepack pnpm typecheck
corepack pnpm format:check
corepack pnpm lint
```

All final commands passed. The DB command reported 19 files / 41 tests, the worker command reported 11 files / 14 tests, `typecheck` completed all 17 workspace packages, and Prettier and ESLint completed without findings.

## Fix Round 2b

Scope was limited to the remaining C3 billing review findings: claim-bound charge authorization, atomic reservation release and late-charge overage accounting, the Generation Worker SQL adapter, and migration deployability checks. No unrelated Task 26 findings, Task 00 material, credentials, commits, resets, or workspace cleanup were changed.

### RED Evidence

```powershell
corepack pnpm --filter @comic-canvas/db test -- attempt-charge-settlement.integration.test.ts migration.integration.test.ts
corepack pnpm --filter @comic-canvas/worker-generation test -- billing-reconciliation.integration.test.ts postgres-attempt-charge-ledger.integration.test.ts
```

The DB suite failed because a released reservation followed by a late provider charge had no explicit `overageMicros` representation, and the migration verifier still accepted the previous C3 contracts. The worker suite failed because `BillingReconciler` was synchronous and `PostgresAttemptChargeLedger` did not exist.

### Implementation And Coverage

- `generation_attempts` now persist `outbox_event_id` and `outbox_payload_hash`. `record_attempt_charge` accepts a generation attempt ID plus a verified work claim (`eventId`, payload hash, and current claim token) and verifies it against the linked, leased `outbox_events` row before deriving billing scope or settling.
- The charge function remains limited to the generation worker role but no longer relies on the shared role check alone. Its caller cannot supply tenant, project, reservation, or billable-attempt scope.
- `release_usage_reservation` now locks and validates the reservation/billable-attempt scope, releases the remaining hold, reduces the project reserved balance, appends balanced hold/budget release movements, and marks the billable attempt canceled with `canceled_at`.
- `billing_budgets.overage_micros` is a generated value. New reserves still enforce the project limit; late provider charges are never rejected merely because released capacity was reused and instead become representable overage.
- Added async `PostgresAttemptChargeLedger` with an injected query port. It calls the nine-argument claim-bound SQL function. `AttemptChargeLedger` and `BillingReconciler` are asynchronous, and the reconciler forwards only generation attempt identity, verified claim, and provider charge evidence.
- Migration verification now rejects the old six-argument charge signature and placeholder release body, validates release semantics, checks the persisted work-event fields, and verifies the corrected six-argument provider-bootstrap comment signature. The executable ledger coverage verifies release, capacity reuse, late provider charge, and overage summary behavior.

### Environment Limitation

Docker Desktop and its daemon are available, but no local PostgreSQL image or `psql` client is installed. The attempted official `postgres:16` image download did not complete, so live SQL migration execution was not available. The evidence therefore does not claim a live database run; it uses the repository migration parser plus executable accounting and worker-adapter integration tests.

### GREEN Evidence

```powershell
corepack pnpm --filter @comic-canvas/db test -- attempt-charge-settlement.integration.test.ts migration.integration.test.ts ledger.integration.test.ts
corepack pnpm --filter @comic-canvas/worker-generation test -- billing-reconciliation.integration.test.ts postgres-attempt-charge-ledger.integration.test.ts
corepack pnpm --filter @comic-canvas/db typecheck
corepack pnpm --filter @comic-canvas/worker-generation typecheck
```

All commands passed: the DB suite reported 19 files / 42 tests and the worker suite reported 12 files / 15 tests.

### Final Verification

```powershell
corepack pnpm --filter @comic-canvas/db test -- attempt-charge-settlement.integration.test.ts migration.integration.test.ts ledger.integration.test.ts
corepack pnpm --filter @comic-canvas/worker-generation test -- billing-reconciliation.integration.test.ts postgres-attempt-charge-ledger.integration.test.ts
corepack pnpm typecheck
corepack pnpm format:check
corepack pnpm lint
```

All final commands passed. The DB suite reported 19 files / 42 tests, the worker suite reported 12 files / 15 tests, all 17 workspace typechecks completed, and Prettier and ESLint completed without findings.

## Fix Round 3

Scope was limited to the last C3 findings: durable claim binding after an Outbox state transition and explicit budget-overage behavior. No other Task 26 modules, credentials, Task 00 material, commits, resets, or workspace cleanup were changed.

### RED Evidence

```powershell
corepack pnpm --filter @comic-canvas/db test -- attempt-charge-claim.integration.test.ts attempt-charge-settlement.integration.test.ts migration.integration.test.ts
```

Before the implementation, migration coverage failed because Outbox events did not persist a claim-token hash, generation attempts did not bind that proof, and `record_attempt_charge` required `state = 'claimed'` plus an unexpired lease. The pre-existing executable accounting scenario already demonstrated that a late provider charge becomes overage and blocks subsequent reserves; Round 3 adds the explicit post-overage reserve rejection assertion.

### Implementation And Coverage

- `outbox_events.claim_token_hash` is a generated SHA-256 value derived from the persisted claim token. `generation_attempts` persists the matching `outbox_claim_token_hash` alongside UUID `outbox_event_id` and payload hash, eliminating the prior UUID/text ambiguity.
- Charge reconciliation checks the durable event ID, payload hash, and claim-token hash binding. It accepts `claimed`, `published`, and `terminal` Outbox records and does not depend on the short claim lease, allowing valid poll, webhook, and late reconciliation after a publication or terminal transition or after lease expiry.
- Mismatched event ID, payload hash, or claim proof is rejected. Executable coverage exercises valid published, terminal, and expired-claim bindings and all three mismatch cases.
- The table-level budget cap remains removed. `overage_micros` remains generated from spent plus reserved capacity, while `reserve_usage` retains its atomic limit predicate. The settlement test verifies release, capacity reuse, successful late adjustment/overage, and rejection of a later new reservation.
- Migration verification now requires durable claim hashes, rejects the old lease/state predicate, and validates normalized UUID event binding.

### GREEN Evidence

```powershell
corepack pnpm --filter @comic-canvas/db test -- attempt-charge-claim.integration.test.ts attempt-charge-settlement.integration.test.ts migration.integration.test.ts
corepack pnpm --filter @comic-canvas/worker-generation test -- billing-reconciliation.integration.test.ts postgres-attempt-charge-ledger.integration.test.ts
corepack pnpm --filter @comic-canvas/db typecheck
```

The focused DB suite passed 20 files / 48 tests, the worker suite passed 12 files / 15 tests, and DB typecheck passed.

### Final Verification

```powershell
corepack pnpm --filter @comic-canvas/db test -- attempt-charge-claim.integration.test.ts attempt-charge-settlement.integration.test.ts migration.integration.test.ts ledger.integration.test.ts
corepack pnpm --filter @comic-canvas/worker-generation test -- billing-reconciliation.integration.test.ts postgres-attempt-charge-ledger.integration.test.ts
corepack pnpm typecheck
corepack pnpm format:check
corepack pnpm lint
```

All final commands passed. The DB suite reported 20 files / 48 tests, the worker suite reported 12 files / 15 tests, all 17 workspace typechecks completed, and Prettier and ESLint completed without findings.

## Fix Round 4

Scope was limited to durable billing authorization binding. No unrelated Task 26 behavior, Task 00 material, credentials, commits, resets, or workspace cleanup was changed.

### Root Cause And RED Evidence

`app.claim_outbox` rotates `claim_token` whenever a pending or expired claimed event is reclaimed. Round 3 copied the current token hash into `generation_attempts`, but provided no production write or rotation path for that snapshot. Consequently, a legitimate late or polling charge after reclaim could never match the new Outbox token hash.

The tests were changed to the stable Attempt-to-original-`generation.submit`-event model before implementation. The following RED commands failed as intended:

```powershell
corepack pnpm --filter @comic-canvas/db test -- attempt-charge-binding.integration.test.ts
corepack pnpm --filter @comic-canvas/worker-generation test -- billing-reconciliation.integration.test.ts postgres-attempt-charge-ledger.integration.test.ts
```

The DB suite reported all three new binding tests failing: there was no atomic production creation function, the charge function still required `claimToken`, and it did not validate an immutable binding's event/hash/route. The worker suite reported two failures because the reconciler still required `claimToken` and the PostgreSQL adapter still sent nine arguments.

### Implementation And Coverage

- Removed `outbox_events.claim_token_hash`, all GenerationAttempt token/event snapshot columns, and the test-only claim helper. The operational Outbox `claim_token` remains solely for dispatcher lease ownership and may rotate freely.
- Added `app.generation_work_bindings`, with one binding per GenerationAttempt and Outbox event, a fixed `generation.submit` route, SHA-256 payload constraint, an update/delete rejection trigger, and database foreign keys on matching physical types. Generation identity uses the existing text composite key. Outbox identity uses UUID `outbox_tenant_id/outbox_event_id`, with a check tying the UUID tenant to the Generation text tenant; no text-to-UUID foreign key was added.
- Added the production `SECURITY DEFINER` function `app.create_generation_attempt_work`. A single statement creates the billable attempt, reserves budget, creates the pending Outbox event, creates the GenerationAttempt, and writes the immutable binding. PostgreSQL statement atomicity rolls all five writes back together. The function returns exactly the queue payload fields `eventId`, `route`, and `payloadHash`, and only `comic_api` can execute it.
- `app.record_attempt_charge` now accepts the GenerationAttempt ID, event UUID and payload hash plus provider charge evidence. It derives tenant/project/billable/reservation scope through the immutable binding, accepts claimed/published/terminal events independent of lease expiry or token rotation, and rejects pending events and mismatched event, hash, route, Outbox tenant, or billable scope.
- The Generation Worker reconciler and PostgreSQL adapter now use `workBinding: { eventId, payloadHash }` and call the eight-argument SQL function. No rotating token or caller-supplied tenant/project/reservation scope crosses the adapter.
- RED/GREEN coverage verifies the atomic production write body, typed foreign keys and immutability, actual Outbox token rotation with no charge dependency, valid published/terminal/expired-lease reconciliation, rejection of pending/wrong event/hash/route, and the worker SQL parameter order.

### Migration Deployability Limitation

A live `postgres:16` probe cannot execute the repository migration chain far enough to run the Task 26 functions. It fails first at `0001_identity.sql:139` because `bootstrap_http_project_scope` declares `project_id` more than once. Independently, `0001` defines `app.projects.tenant_id/id` as UUID while `0003` and later tables declare text columns that directly reference those UUID keys, which PostgreSQL cannot use for a foreign key. Those pre-existing migration defects are outside this fix scope.

Round 4 therefore does not claim a successful full live migration. Its new binding constraints are deployable in isolation with the intended types: text references text Generation keys, and UUID references UUID Outbox keys. Evidence combines the live failure probe, migration-contract tests, accounting tests, and worker adapter tests.

### Verification

```powershell
corepack pnpm --filter @comic-canvas/db test -- attempt-charge-binding.integration.test.ts attempt-charge-settlement.integration.test.ts migration.integration.test.ts ledger.integration.test.ts
corepack pnpm --filter @comic-canvas/worker-generation test -- billing-reconciliation.integration.test.ts postgres-attempt-charge-ledger.integration.test.ts
corepack pnpm typecheck
corepack pnpm format:check
corepack pnpm lint
```

All final Round 4 commands passed. The DB command reported 20 files / 45 tests, the worker command reported 12 files / 15 tests, all 17 workspace typechecks completed, and Prettier and ESLint completed without findings.

## SafeFetch Fix

### Root Cause And RED Evidence

The prior runtime proxy accepted an injected abstract transport but shipped no concrete Node HTTPS implementation. Its IP policy matched only a short list of IPv4 private prefixes, so documentation, benchmarking, multicast, reserved, and several IPv6 special-purpose ranges could pass. Media also duplicated the old caller-controlled request shape and silently defaulted to a process-local receipt store.

The following command was run before implementation:

```powershell
corepack pnpm --filter @comic-canvas/storage test -- safe-fetch.test.ts safe-fetch-proxy.test.ts
```

It failed as intended because `isGlobalUnicastIp` and `createNodeHttpsTransport` did not exist; the redirect-private assertion also returned the generic initial-hop address error.

### Implementation And Coverage

- Added global-unicast policy classification for IPv4 private/shared/link-local/documentation/benchmark/multicast/reserved ranges and IPv6 unspecified/loopback/link-local/ULA/multicast/documentation/benchmark/special ranges, including IPv4-mapped addresses. The legacy validator remains source-local policy/test code and is no longer exported from the storage package entrypoint.
- Added `createNodeHttpsTransport`. It uses `https.request` with a lookup callback that returns only the already-pinned IP, preserves the original hostname as TLS `servername`, enables certificate verification, disables connection pooling, rejects redirects at the transport layer, aborts on timeout, and destroys the response once the byte cap is exceeded while returning status, Location headers, byte count, and SHA-256.
- Formally exported the runtime proxy factory, concrete transport, transport error, and runtime types from `@comic-canvas/storage`.
- Changed provider-output ingest to use a runtime-only request shape without resolver or redirect fields. Receipt storage is mandatory; the named `InMemoryProviderOutputIngestReceiptStore` is test-only and rejected by the production dependency assertion.
- Added a Media package-boundary contract test plus a dedicated compile-time contract configuration. It proves that a storage `createSafeFetchProxy` instance is assignable to and accepted by Media production composition without importing or duplicating storage network policy in the Media runtime package.

### Verification

```powershell
corepack pnpm --filter @comic-canvas/storage test
corepack pnpm --filter @comic-canvas/worker-media test
corepack pnpm --filter @comic-canvas/worker-generation test -- provider-output-dispatch.integration.test.ts
& .\node_modules\.bin\tsc.cmd -p apps/worker-media/test/tsconfig.safe-fetch-port.json --noEmit
corepack pnpm typecheck
corepack pnpm format:check
corepack pnpm lint
```

Directed coverage exercises every-hop DNS validation, rebinding, private redirects, pinned-IP TLS/SNI request options, response byte cap, timeout abort, expired locator zero-download behavior, and Generation provider-output dispatch with zero download sockets.

## SafeFetch Stream Fix Follow-up

### Root Cause

The SafeFetch runtime had already moved from a callback sink to the streaming
`SafeFetchQuarantineSink` contract and from a `consume` receipt helper to the
durable `claim` / `complete` / `fail` state machine. Four tests still created
the old callback sink or a `consume`-only receipt adapter. The valid-ingest test
therefore threw when its proxy called the non-callable sink; ingest caught that
exception and correctly returned `SAFE_FETCH_TRANSPORT_REJECTED` as a
recoverable failure. The production composition test supplied an adapter that
did not implement the durable receipt interface, so its dependency assertion
correctly rejected it. Cross-package TypeScript additionally exposed a
`response.resume()` return value where the serialized write promise requires
`void`.

### Fix And Coverage

- Converted the Media ingest fixtures to a real streaming sink. The valid flow
  writes `payload`, completes with a quarantine receipt, and asserts that all
  bytes reached the sink before the `quarantined` result is recorded.
- The Node HTTPS transport test now asserts the complete streamed payload and
  the SHA-256 supplied to `complete`; `resume()` is explicitly void-returning
  in the serialized write chain.
- Production Media composition now requires a quarantine sink and a real
  `PostgresProviderOutputIngestReceiptStore`. The contract test uses that store
  with a query port, a storage runtime proxy, a complete quarantine sink, and a
  consumer. Both the named in-memory store and a shape-compatible durable duck
  store remain rejected.

### Verification

```powershell
corepack pnpm --filter @comic-canvas/storage test -- safe-fetch.test.ts safe-fetch-proxy.test.ts
corepack pnpm --filter @comic-canvas/worker-media test -- ingest-provider-output.test.ts safe-fetch-port.contract.test.ts postgres-provider-output-ingest-receipts.test.ts bootstrap.test.ts
corepack pnpm --filter @comic-canvas/db test -- provider-output-ingest-receipt.integration.test.ts migration.integration.test.ts
corepack pnpm --filter @comic-canvas/worker-generation test -- provider-output-dispatch.integration.test.ts
& .\node_modules\.bin\tsc.cmd -p apps/worker-media/test/tsconfig.safe-fetch-port.json --noEmit
corepack pnpm typecheck
corepack pnpm format:check
corepack pnpm lint
```

All commands passed: Storage 21 tests, Media 8 tests, DB 46 tests, Generation
15 tests, the cross-package contract compile, 17 workspace typechecks,
Prettier, and ESLint.

## SafeFetch Review Round 2

### Root Cause

The initial runtime timeout was passed independently to each DNS lookup and
transport hop. Redirects therefore reset the budget, and Node's request timeout
is an inactivity timer, so a slow-drip body could outlive the intended request
deadline. Redirect and non-success responses were also drained with `resume()`.
The receipt state machine had no lease or fencing token, and the Media caller
rather than the database supplied the quarantine key. Finally, sink operations
were not keyed, so retry semantics were implicit rather than conditional.

### Fix

- A SafeFetch operation now owns one absolute deadline and abort signal. DNS,
  re-resolution, redirects, connection, body streaming, and sink completion all
  share it; Node transport additionally uses an absolute timer rather than only
  its inactivity timeout. The active response is destroyed on timeout.
- Redirect/non-2xx bodies are destroyed immediately without opening, writing,
  completing, or draining the quarantine sink.
- `provider_output_ingest_receipts` now persists `lease_until` and a rotated
  `claim_token`. A stale lease can be reclaimed; complete/fail require the
  current token, preventing an older worker from finalizing a newer claim.
- The claim function generates the deterministic quarantine key and returns it
  with the fencing token. Media passes that key through the runtime proxy and
  verifies the returned receipt key, byte count, and digest before completion.
  `open`, `write`, `complete`, and `abort` all receive the expected key, making
  a conditional/upsert object-store implementation explicit. The design is
  recoverable through a deterministic key and DB fencing, not an assertion of
  an atomic object-store plus database transaction.

### Review Coverage

- Controlled fake-time tests prove a slow DNS resolution, cumulative redirect
  latency, and a slow-drip body stop at the single absolute deadline with no
  quarantine completion.
- Response tests prove redirect bodies are destroyed with zero sink operations.
- Media retry coverage proves the same claim key is reused after a DB completion
  interruption and an idempotent sink does not create a second object.
- Migration coverage checks deterministic DB key generation, lease/token
  rotation, and token predicates on complete/fail.

### Verification

```powershell
corepack pnpm --filter @comic-canvas/storage test -- safe-fetch.test.ts safe-fetch-proxy.test.ts
corepack pnpm --filter @comic-canvas/worker-media test -- ingest-provider-output.test.ts safe-fetch-port.contract.test.ts postgres-provider-output-ingest-receipts.test.ts bootstrap.test.ts
corepack pnpm --filter @comic-canvas/db test -- provider-output-ingest-receipt.integration.test.ts migration.integration.test.ts
corepack pnpm --filter @comic-canvas/worker-generation test -- provider-output-dispatch.integration.test.ts
& .\node_modules\.bin\tsc.cmd -p apps/worker-media/test/tsconfig.safe-fetch-port.json --noEmit
corepack pnpm typecheck
corepack pnpm format:check
corepack pnpm lint
```

All listed commands passed: Storage 24 tests, Media 9 tests, DB 46 tests,
Generation 15 tests, the contract compile, 17 workspace typechecks, Prettier,
and ESLint.
