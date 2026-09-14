import { expect, test } from "bun:test";

import { canUseCustomChannels } from "../src/stores/use-user-store";

test("custom channels are available only to active administrators", () => {
    expect(canUseCustomChannels({ role: "admin", status: "active" }, true)).toBe(true);
    expect(canUseCustomChannels({ role: "admin", status: "disabled" }, true)).toBe(false);
    expect(canUseCustomChannels({ role: "user", status: "active" }, true)).toBe(false);
    expect(canUseCustomChannels({ role: "admin", status: "active" }, false)).toBe(false);
});
