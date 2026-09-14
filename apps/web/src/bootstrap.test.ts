import { describe, expect, it } from "vitest";
import * as entry from "./index.js";

describe("apps/web bootstrap", () => {
  it("imports the real public entry", () => {
    expect(Object.keys(entry).length).toBeGreaterThan(0);
  });

  it("hydrates auth before protected routes mount", async () => {
    const result = await entry.bootstrapWebApp({
      getSession: async () => ({ user: { issuer: "https://issuer.test", subject: "user-123", audience: "comic-api" } }),
    });

    expect(result.auth.status).toBe("authenticated");
    expect(result.routes).toContain("/projects");
  });

  it("keeps protected routes out of the mount result when the cookie is absent", async () => {
    const result = await entry.bootstrapWebApp({ getSession: async () => ({ user: null }) });

    expect(result.auth.status).toBe("anonymous");
    expect(result.routes).toEqual(["/login"]);
  });
});
