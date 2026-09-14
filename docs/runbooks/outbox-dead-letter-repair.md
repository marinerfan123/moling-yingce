# Outbox dead-letter repair

1. Identify the exact `eventId`, current attempt and route.
2. Prove the consumer effect is idempotent before repair.
3. Run dry-run first:
   `node scripts/requeue-outbox.mjs --event-id <id> --expected-attempt <n> --reason "<root cause>"`
4. Execute only after approval:
   `node scripts/requeue-outbox.mjs --event-id <id> --expected-attempt <n> --reason "<root cause>" --execute true`
5. Capture the printed audit ID in the incident record.

Never run broad queue repairs and never alter payload hashes.
