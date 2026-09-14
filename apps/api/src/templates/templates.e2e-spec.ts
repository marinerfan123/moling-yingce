import { describe, expect, it } from "vitest";

import { apiControllers, apiModules } from "../app.module.js";
import { TemplatesController, VERTICAL_COMIC_TEMPLATE_ID } from "./templates.controller.js";

describe("vertical comic template read API", () => {
  it("registers a reachable controller and module", () => {
    expect(apiControllers).toContain("TemplatesController");
    expect(apiModules).toContain("TemplatesModule");
  });

  it("returns the built-in template as read-only data without creating jobs", () => {
    const controller = new TemplatesController();
    const template = controller.read(VERTICAL_COMIC_TEMPLATE_ID);

    expect(template).toMatchObject({
      templateId: VERTICAL_COMIC_TEMPLATE_ID,
      checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
      readonly: true,
      builtIn: true,
      createsJobs: false,
      resourcePolicy: "confirm",
      noJobsCreated: true,
    });
    expect(template?.nodes.map(({ kind }) => kind)).toEqual([
      "Script",
      "Bibles",
      "Shot",
      "Image",
      "Video",
      "Voice",
      "Timeline",
      "Export",
      "ReviewGate",
    ]);
    expect(controller.read("unknown-template")).toBeUndefined();
  });
});
