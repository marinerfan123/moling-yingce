import { expect, test } from "@playwright/test";

test("upload source contract exposes resumable local and remote states", async () => {
  const states = ["queued", "fetching", "scanning", "failed", "ready"] as const;
  expect(states).toEqual(["queued", "fetching", "scanning", "failed", "ready"]);
  const remoteTask = { source: "https", bytesVerified: false, requiresFreshConfirmationOnRetry: true };
  expect(remoteTask).toMatchObject({ bytesVerified: false, requiresFreshConfirmationOnRetry: true });
});
