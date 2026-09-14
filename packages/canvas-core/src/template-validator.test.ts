import { describe, expect, it } from "vitest";

import { verticalComicTemplate } from "./templates/vertical-comic.js";
import { assertValidTemplate, validateTemplate } from "./template-validator.js";

describe("vertical comic template", () => {
  it("contains the complete registered production graph", () => {
    expect(validateTemplate(verticalComicTemplate)).toEqual([]);
    expect(verticalComicTemplate.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining([
        "script",
        "character",
        "shot",
        "image-generation",
        "video-generation",
        "voice-generation",
        "timeline-output",
        "export",
        "review-gate",
      ]),
    );
    expect(verticalComicTemplate.nodes.some((node) => node.kind === "unknown")).toBe(false);
  });

  it("is immutable metadata and has proposals only", () => {
    expect(verticalComicTemplate.templateId).toBe("vertical-comic");
    expect(verticalComicTemplate.version).toBe("1.0.0");
    expect(verticalComicTemplate.checksum).toHaveLength(64);
    expect(verticalComicTemplate.capabilities).toEqual([]);
    expect(verticalComicTemplate.createsJobs).toBe(false);
    expect(
      verticalComicTemplate.proposals.every(
        (proposal) => proposal.type === "node.add" || proposal.type === "edge.connect",
      ),
    ).toBe(true);
    expect(assertValidTemplate(verticalComicTemplate)).toBe(verticalComicTemplate);
  });

  it("rejects unknown kinds and invalid edge ports", () => {
    const unknown = {
      ...verticalComicTemplate,
      nodes: [
        ...verticalComicTemplate.nodes,
        { ...verticalComicTemplate.nodes[0], id: "node_unknown1", kind: "unknown" as const },
      ],
    };
    expect(validateTemplate(unknown as never).some((diagnostic) => diagnostic.code === "UNKNOWN_NODE_KIND")).toBe(true);
    const invalid = { ...verticalComicTemplate, edges: [{ ...verticalComicTemplate.edges[0], sourcePort: "missing" }] };
    expect(validateTemplate(invalid as never).some((diagnostic) => diagnostic.code === "INVALID_PORT")).toBe(true);
  });
});
