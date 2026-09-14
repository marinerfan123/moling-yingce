import { describe, expect, it } from "vitest";
import { BetaAccessGuard } from "./beta-access.guard.js";
import { BetaAccessService } from "./beta-access.service.js";

describe("beta access gate", () => {
  it("supports off/open modes and allowlist grant/revoke/expiry", () => {
    expect(new BetaAccessGuard("off", new BetaAccessService()).canActivate("anyone")).toBe(true);
    expect(new BetaAccessGuard("open", new BetaAccessService()).canActivate("anyone")).toBe(true);
    expect(
      new BetaAccessGuard(
        "allowlist",
        new BetaAccessService([{ subject: "user-1", state: "granted", expiresAt: new Date(Date.now() + 60_000) }]),
      ).canActivate("user-1"),
    ).toBe(true);
    expect(
      new BetaAccessGuard("allowlist", new BetaAccessService([{ subject: "user-1", state: "revoked" }])).canActivate(
        "user-1",
      ),
    ).toBe(false);
  });
});
