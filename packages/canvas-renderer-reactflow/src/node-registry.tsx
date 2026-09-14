import { AudioNode } from "./nodes/audio-nodes.js";
import { AuxiliaryNode } from "./nodes/auxiliary-nodes.js";
import { BibleNode } from "./nodes/bible-nodes.js";
import { CompositionNode } from "./nodes/composition-nodes.js";
import { ContentNode } from "./nodes/content-nodes.js";
import { MediaNode } from "./nodes/media-nodes.js";
import { UnknownNode } from "./nodes/unknown-node.js";
import type { RenderableNode } from "./node-shell.js";

export const rendererNodeKinds = [
  "script",
  "scene",
  "shot",
  "character",
  "location",
  "prop",
  "style",
  "asset-input",
  "image-generation",
  "video-generation",
  "voice-generation",
  "audio",
  "caption",
  "timeline-output",
  "export",
  "review-gate",
  "frame",
  "note",
] as const;

export type RendererNodeKind = (typeof rendererNodeKinds)[number] | "unknown";
export type CanvasNodeRenderer = (node: RenderableNode) => unknown;

const registry = new Map<string, CanvasNodeRenderer>();

export function registerCanvasNodeRenderer(kind: string, renderer: CanvasNodeRenderer): void {
  registry.set(kind, renderer);
}

export function canvasNodeRenderers(): ReadonlyMap<string, CanvasNodeRenderer> {
  return registry;
}

export function createRendererRegistry() {
  const next = new Map<string, CanvasNodeRenderer>();
  const content = ["script", "scene", "shot"] as const;
  const bibles = ["character", "location", "prop", "style"] as const;
  const media = ["asset-input", "image-generation", "video-generation", "frame"] as const;
  const audio = ["voice-generation", "audio"] as const;
  const composition = ["caption", "timeline-output", "export", "review-gate"] as const;
  const auxiliary = ["note"] as const;
  for (const kind of content) next.set(kind, (node) => <ContentNode node={node} />);
  for (const kind of bibles) next.set(kind, (node) => <BibleNode node={node} />);
  for (const kind of media) next.set(kind, (node) => <MediaNode node={node} />);
  for (const kind of audio) next.set(kind, (node) => <AudioNode node={node} />);
  for (const kind of composition) next.set(kind, (node) => <CompositionNode node={node} />);
  for (const kind of auxiliary) next.set(kind, (node) => <AuxiliaryNode node={node} />);
  next.set("unknown", (node) => <UnknownNode node={node} />);
  return next as ReadonlyMap<RendererNodeKind, CanvasNodeRenderer>;
}
