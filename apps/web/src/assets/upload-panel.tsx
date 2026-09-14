import React from "react";

export type UploadDisplayState = "queued" | "fetching" | "scanning" | "failed" | "ready";

export function UploadPanel({
  onLocalFile,
  state = "queued",
  error,
}: Readonly<{
  onLocalFile?: (file: File) => void;
  state?: UploadDisplayState;
  error?: string;
}>) {
  return (
    <section aria-label="上传素材" className="asset-upload-panel">
      <h2>添加素材</h2>
      <label>
        本地文件
        <input
          accept="image/*,video/*,audio/*,application/pdf"
          data-testid="local-upload"
          type="file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onLocalFile?.(file);
          }}
        />
      </label>
      <p aria-live="polite" data-testid="upload-state">
        {state === "failed" ? (error ?? "上传失败") : state}
      </p>
    </section>
  );
}
