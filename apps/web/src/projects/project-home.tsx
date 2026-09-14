import React from "react";

import { ProjectCreateDialog } from "./project-create-dialog.js";
import { ProjectList } from "./project-list.js";

export function ProjectHome({ projects }: Readonly<{ projects: readonly { id: string; title: string }[] }>) {
  return (
    <main>
      <h1>项目</h1>
      <ProjectList projects={projects} />
      <ProjectCreateDialog open={projects.length === 0} />
    </main>
  );
}
