export const outboxSchema = Object.freeze({
  tables: ["outbox_events", "outbox_broker_attempts", "outbox_repairs", "consumer_receipts"],
});
