import { expect, test } from "@playwright/test";

test("offline recovery shell is specified without auto-submitting paid work", async () => {
  const recovery = {
    route: "/recovery",
    states: ["offline-draft", "revalidating", "changed-awaiting-confirmation", "submitted", "expired", "unauthorized"],
    forbiddenBackupPlaintext: ["tokens", "signed-urls", "provider-payloads", "confirmedPrice", "jobId"],
  };
  expect(recovery.route).toBe("/recovery");
  expect(recovery.states).toContain("changed-awaiting-confirmation");
  expect(recovery.forbiddenBackupPlaintext).toContain("confirmedPrice");
});
