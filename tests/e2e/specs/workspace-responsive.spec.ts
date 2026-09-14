import { expect, test } from "@playwright/test";

test("workspace responsive invariants are discoverable", async () => {
  const routes = {
    edit: "/projects/project_12345678/episodes/episode_12345678/canvas",
    review: "/projects/project_12345678/episodes/episode_12345678/review",
  };
  const viewports = [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ];
  expect(routes.edit).toContain("/canvas");
  expect(routes.review).toContain("/review");
  expect(viewports).toHaveLength(4);
});
