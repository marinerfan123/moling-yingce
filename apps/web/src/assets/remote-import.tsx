import React from "react";

export type RemoteImportState = "queued" | "fetching" | "scanning" | "failed" | "ready";

export function RemoteImport({
  onSubmit,
  onRetry,
  state = "queued",
  requiresFreshConfirmation = false,
}: Readonly<{
  onSubmit?: (url: string) => void;
  onRetry?: (url: string) => void;
  state?: RemoteImportState;
  requiresFreshConfirmation?: boolean;
}>) {
  const [url, setUrl] = React.useState("");
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (/^https:\/\//i.test(url)) onSubmit?.(url);
  };
  return (
    <section aria-label="远程导入" className="asset-remote-import">
      <h2>HTTPS 地址</h2>
      <form onSubmit={submit}>
        <input
          aria-label="HTTPS 地址"
          data-testid="remote-url"
          inputMode="url"
          placeholder="https://"
          required
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <button type="submit">创建导入任务</button>
      </form>
      <p aria-live="polite" data-testid="remote-state">
        {state}
      </p>
      {requiresFreshConfirmation && (
        <button type="button" onClick={() => onRetry?.(url)}>
          重新确认并重试
        </button>
      )}
      <small>远程字节将在抓取并扫描后验证。</small>
    </section>
  );
}
