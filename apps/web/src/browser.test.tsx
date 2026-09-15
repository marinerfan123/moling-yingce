import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrowserApp } from "./browser.js";

afterEach(cleanup);

describe("browser application", () => {
  it("shows an explicit preview entry when the server session is anonymous", async () => {
    render(<BrowserApp bootstrap={async () => ({ routes: ["/login"], auth: { status: "anonymous", user: null } })} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "影策" })).toBeTruthy());
    expect(screen.getByText("登录后管理项目与生成任务")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "预览工作区" }));
    expect(screen.getByText("预览模式：不会写入项目数据")).toBeTruthy();
  });

  it("renders the project home after the session is authenticated", async () => {
    const bootstrap = vi.fn(async () => ({
      routes: ["/projects"],
      auth: {
        status: "authenticated" as const,
        user: { issuer: "https://issuer.test", subject: "user-1", audience: "comic-api" },
      },
    }));
    render(<BrowserApp bootstrap={bootstrap} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "项目" })).toBeTruthy());
    expect(screen.getByText("新建项目后进入默认剧集画布")).toBeTruthy();
  });
});
