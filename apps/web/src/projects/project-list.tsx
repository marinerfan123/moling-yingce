import React from "react";

export function ProjectList({ projects }: Readonly<{ projects: readonly { id: string; title: string }[] }>) {
  if (projects.length === 0) return <p role="status">还没有项目，创建第一部漫剧。</p>;
  return (
    <ul aria-label="项目列表">
      {projects.map((project) => (
        <li key={project.id}>{project.title}</li>
      ))}
    </ul>
  );
}
