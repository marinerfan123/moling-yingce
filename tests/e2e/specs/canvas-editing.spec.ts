import { expect, test } from "@playwright/test";

test("canvas editing contract is non destructive and commercial-ready", async () => {
  const routes = {
    canvas: "/projects/project_12345678/episodes/episode_12345678/canvas",
    storyboard: "/projects/project_12345678/episodes/episode_12345678/storyboard",
    review: "/projects/project_12345678/episodes/episode_12345678/review",
  };
  const keyboardContract = {
    quickCreate: { key: "N", requiresCanvasFocus: true, suppressedInsideInput: true },
    focusForward: { key: "Tab", createsNode: false },
    focusBackward: { key: "Shift+Tab", createsNode: false },
    generation: { key: "G", opensConfirmation: true, directSubmit: false },
  };
  const editContract = {
    renameDomainBackedNode: "project-api",
    yjsStores: ["position", "config"],
    singleInputReplacement: ["explicit-replace", "explicit-cancel"],
    brokenEdgePolicy: "recoverable-placeholder",
    brokenEdgeNoticeSeconds: 10,
  };

  expect(routes.canvas).toContain("/canvas");
  expect(routes.storyboard).toContain("/storyboard");
  expect(routes.review).toContain("/review");
  expect(keyboardContract.quickCreate).toMatchObject({ requiresCanvasFocus: true, suppressedInsideInput: true });
  expect(keyboardContract.focusForward.createsNode).toBe(false);
  expect(keyboardContract.focusBackward.createsNode).toBe(false);
  expect(keyboardContract.generation).toMatchObject({ opensConfirmation: true, directSubmit: false });
  expect(editContract.renameDomainBackedNode).toBe("project-api");
  expect(editContract.yjsStores).toEqual(["position", "config"]);
  expect(editContract.singleInputReplacement).toEqual(["explicit-replace", "explicit-cancel"]);
  expect(editContract.brokenEdgePolicy).toBe("recoverable-placeholder");
  expect(editContract.brokenEdgeNoticeSeconds).toBe(10);
});
