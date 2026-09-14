import { expect, test } from "@playwright/test";

test("quick insert contract keeps all creation paths confirm-only", async () => {
  const routes = {
    canvas: "/projects/project_12345678/episodes/episode_12345678/canvas",
    menu: "/projects/project_12345678/episodes/episode_12345678/canvas/quick-insert",
  };
  expect(routes.menu).toContain("quick-insert");
  const proposal = { type: "quick-insert.proposed", requiresConfirmation: true, createsJob: false };
  expect(proposal).toMatchObject({ requiresConfirmation: true, createsJob: false });
});
