export type TestId = string;

export type Point = Readonly<{ x: number; y: number }>;
export type Viewport = Readonly<{ x: number; y: number; zoom: number }>;

export type TestNodeDefinition = Readonly<{
  kind: string;
  title: string;
  inputs?: readonly string[];
  outputs?: readonly string[];
}>;

export type TestCanvasNode = Readonly<{
  id: TestId;
  kind: string;
  position: Point;
  data: Record<string, unknown>;
}>;

export type TestCanvasEdge = Readonly<{
  id: TestId;
  source: TestId;
  target: TestId;
  kind: "flow" | "reference" | "timeline";
  bindingId?: string;
}>;

export type TestCanvasSnapshot = Readonly<{
  id: TestId;
  schemaVersion: 1;
  viewport: Viewport;
  nodes: readonly TestCanvasNode[];
  edges: readonly TestCanvasEdge[];
  meta: Record<string, unknown>;
}>;

export type TestNodeRegistry = Readonly<{
  definitions: readonly TestNodeDefinition[];
  get(kind: string): TestNodeDefinition | undefined;
}>;

export type CanvasYDoc = Readonly<{
  id: string;
  snapshot: TestCanvasSnapshot;
  updates: string[];
}>;

export type DbTestContext = Readonly<{
  ids: { tenantId: string; projectId: string };
  fixture: { projectName: string };
  db: Map<string, unknown>;
  adminDb: Map<string, unknown>;
  scopes: {
    tenant: { tenantId: string; subject: string; requestId: string };
    project: { tenantId: string; projectId: string; subject: string; requestId: string };
  };
  cleanup(): Promise<void>;
}>;

export type TestProviderAdapter = Readonly<{
  submitText(prompt: string): Promise<{ externalId: string; text: string }>;
  submitImage(prompt: string): Promise<{ externalId: string; imageUrl: string }>;
  recover(externalId: string): Promise<"found" | "definitively_absent" | "unknown">;
}>;

export type Mocked<T> = T & Readonly<{ calls: readonly string[] }>;

export type WorkerCheckpoint =
  | "before-submit"
  | "after-submit-before-external-id-commit"
  | "after-provider-success-before-output-commit";

export type WorkerHarnessContext = Readonly<{
  provider: TestProviderAdapter;
  db: DbTestContext;
}>;

export type WorkerHarness = Readonly<{
  runUntil(checkpoint: WorkerCheckpoint): Promise<{ checkpoint: WorkerCheckpoint; effects: readonly string[] }>;
}>;

export type TestStoryParseProposal = Readonly<{
  scenes: readonly { id: string; summary: string }[];
  characters: readonly { id: string; name: string }[];
}>;

export type TestAsset = Readonly<{
  id: string;
  mime: string;
  bytes: number;
  sha256: string;
}>;
