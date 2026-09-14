const args = new Map(
  process.argv
    .slice(2)
    .map((value, index, all) => (value.startsWith("--") ? [value, all[index + 1] ?? "true"] : ["", ""])),
);
const eventId = args.get("--event-id");
const expectedAttempt = Number(args.get("--expected-attempt"));
const reason = args.get("--reason");
const dryRun = args.get("--execute") !== "true";

if (!eventId) throw new Error("event id required: --event-id");
if (!Number.isInteger(expectedAttempt) || expectedAttempt < 0)
  throw new Error("expected attempt required: --expected-attempt");
if (!reason) throw new Error("reason required: --reason");

console.log(
  JSON.stringify({ auditId: `audit_${eventId}_${expectedAttempt}`, eventId, expectedAttempt, reason, dryRun }),
);
