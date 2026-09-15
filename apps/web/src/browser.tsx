import React from "react";
import { createRoot } from "react-dom/client";

import { bootstrapWebApp } from "./main.js";
import type { WebAuthState } from "./auth/auth-session.js";
import { ProjectHome } from "./projects/project-home.js";
import { WorkspaceShell } from "./workspace/workspace-shell.js";
import "./browser.css";

type BootstrapResult = Awaited<ReturnType<typeof bootstrapWebApp>>;
type Bootstrap = () => Promise<BootstrapResult>;

export function BrowserApp({
  bootstrap = bootstrapWebApp,
  initialPath = globalThis.location?.pathname ?? "/",
}: Readonly<{ bootstrap?: Bootstrap; initialPath?: string }>) {
  const [result, setResult] = React.useState<BootstrapResult | null>(null);
  const [preview, setPreview] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void bootstrap()
      .then((next) => {
        if (active) setResult(next);
      })
      .catch(() => {
        if (active) setResult({ routes: ["/login"], auth: { status: "anonymous", user: null } });
      });
    return () => {
      active = false;
    };
  }, [bootstrap]);

  if (!result) return <main className="app-loading">正在准备工作区...</main>;
  if (result.auth.status === "anonymous" && !preview) {
    return <LoginScreen onPreview={() => setPreview(true)} />;
  }
  return <AuthenticatedShell auth={result.auth} path={initialPath} preview={preview} />;
}

function LoginScreen({ onPreview }: Readonly<{ onPreview: () => void }>) {
  return (
    <main className="login-screen">
      <section className="login-card" aria-labelledby="login-title">
        <span className="eyebrow">COMIC CANVAS / TV</span>
        <h1 id="login-title">影策</h1>
        <p className="login-lead">漫剧无限画布创作工作台</p>
        <p className="login-copy">登录后管理项目与生成任务</p>
        <a className="primary-link" href="/v1/auth/session">
          检查登录状态
        </a>
        <button className="secondary-button" type="button" onClick={onPreview}>
          预览工作区
        </button>
        <p className="login-note">预览模式仅展示当前改版的工作流，不会写入项目数据。</p>
      </section>
    </main>
  );
}

function AuthenticatedShell({ auth, path, preview }: Readonly<{ auth: WebAuthState; path: string; preview: boolean }>) {
  const isWorkspace = path.includes("/episodes/");
  return (
    <div className="app-frame">
      <header className="app-header">
        <div>
          <span className="eyebrow">COMIC CANVAS</span>
          <strong>影策</strong>
        </div>
        <div className="header-meta">
          {preview ? <span className="preview-pill">预览模式：不会写入项目数据</span> : <span>已登录</span>}
          <span className="health-pill">系统在线</span>
        </div>
      </header>
      <nav className="app-nav" aria-label="主导航">
        <a href="/projects">项目</a>
        <a href="/governance">治理</a>
        <a href="/recovery">恢复</a>
        <span className="identity">{auth.user?.subject ?? "preview"}</span>
      </nav>
      <section className="app-content">
        {isWorkspace ? (
          <WorkspaceShell route={path} capabilities={["canvas", "review"]} viewportWidth={1440} viewportHeight={900} />
        ) : (
          <>
            <p className="section-kicker">WORKSPACE / PROJECTS</p>
            <p className="section-copy">新建项目后进入默认剧集画布</p>
            <ProjectHome projects={[]} />
          </>
        )}
      </section>
    </div>
  );
}

if (typeof document !== "undefined") {
  const root = document.getElementById("root");
  if (root) createRoot(root).render(<BrowserApp />);
}
