/** The signed, built-in template is data-only: reading it cannot enqueue work. */
export const VERTICAL_COMIC_TEMPLATE_ID = "vertical-comic" as const;
export const VERTICAL_COMIC_TEMPLATE_VERSION = "1.0.0" as const;
export const VERTICAL_COMIC_TEMPLATE_CHECKSUM =
  "f6a3f1b93d5b4c1c9a3a2d1e0f8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a00" as const;

export type BuiltInTemplateNode = Readonly<{
  id: string;
  kind: "Script" | "Bibles" | "Shot" | "Image" | "Video" | "Voice" | "Timeline" | "Export" | "ReviewGate";
  ports: readonly Readonly<{ id: string; direction: "input" | "output"; dataType: string }>[];
}>;

export type BuiltInVerticalComicTemplate = Readonly<{
  templateId: typeof VERTICAL_COMIC_TEMPLATE_ID;
  version: typeof VERTICAL_COMIC_TEMPLATE_VERSION;
  checksum: string;
  name: "Vertical comic drama";
  readonly: true;
  builtIn: true;
  nodes: readonly BuiltInTemplateNode[];
  edges: readonly Readonly<{ source: string; sourcePort: string; target: string; targetPort: string }>[];
  capabilities: readonly never[];
  proposals: readonly never[];
  resourcePolicy: "confirm";
  createsJobs: false;
  noJobsCreated: true;
}>;

const node = (id: string, kind: BuiltInTemplateNode["kind"], dataType: string): BuiltInTemplateNode => ({
  id,
  kind,
  ports: [
    { id: `${id}.in`, direction: "input", dataType },
    { id: `${id}.out`, direction: "output", dataType },
  ],
});

const verticalComicTemplate: BuiltInVerticalComicTemplate = Object.freeze({
  templateId: VERTICAL_COMIC_TEMPLATE_ID,
  version: VERTICAL_COMIC_TEMPLATE_VERSION,
  checksum: VERTICAL_COMIC_TEMPLATE_CHECKSUM,
  name: "Vertical comic drama",
  readonly: true,
  builtIn: true,
  nodes: Object.freeze([
    node("script", "Script", "script"),
    node("bibles", "Bibles", "bible"),
    node("shot", "Shot", "shot"),
    node("image", "Image", "image"),
    node("video", "Video", "video"),
    node("voice", "Voice", "audio"),
    node("timeline", "Timeline", "timeline"),
    node("export", "Export", "export"),
    node("review-gate", "ReviewGate", "review"),
  ]),
  edges: Object.freeze([]),
  capabilities: Object.freeze([]),
  proposals: Object.freeze([]),
  resourcePolicy: "confirm",
  createsJobs: false,
  noJobsCreated: true,
});

export class TemplatesController {
  list(): readonly BuiltInVerticalComicTemplate[] {
    return [verticalComicTemplate];
  }

  read(templateId: string = VERTICAL_COMIC_TEMPLATE_ID): BuiltInVerticalComicTemplate | undefined {
    return templateId === VERTICAL_COMIC_TEMPLATE_ID ? verticalComicTemplate : undefined;
  }
}

export const builtInVerticalComicTemplate = verticalComicTemplate;
