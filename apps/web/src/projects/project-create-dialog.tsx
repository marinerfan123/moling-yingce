import React from "react";

export function ProjectCreateDialog({ open }: Readonly<{ open: boolean }>) {
  if (!open) return null;
  return (
    <section role="dialog" aria-label="创建项目">
      <label>
        项目名
        <input name="title" />
      </label>
      <button>创建并进入默认剧集画布</button>
    </section>
  );
}
