import { createHash } from "node:crypto";

const SHA256 = /^sha256:[a-f0-9]{64}$/;

export type DurableCanvasInput = Readonly<{
  activeCanvasRevisionId: string;
  documentEpoch: number;
  stateVectorHash: string;
  durableSeq: number;
  nodeId: string;
  prompt?: string;
  inputAssetVersionIds?: readonly string[];
  parameters?: Readonly<Record<string, unknown>>;
}>;

export type GenerationInputSnapshot = Readonly<{
  source: "durable-canvas";
  activeCanvasRevisionId: string;
  documentEpoch: number;
  stateVectorHash: string;
  durableSeq: number;
  nodeId: string;
  inputHash: string;
  configHash: string;
}>;

export class GenerationInputContributorRegistry {
  resolve(input: DurableCanvasInput): GenerationInputSnapshot {
    if (!input.activeCanvasRevisionId || !input.nodeId) throw new Error("GENERATION_INPUT_SCOPE_INVALID");
    if (!Number.isInteger(input.documentEpoch) || !Number.isInteger(input.durableSeq)) {
      throw new Error("GENERATION_INPUT_VERSION_INVALID");
    }
    if (!SHA256.test(input.stateVectorHash)) throw new Error("GENERATION_STATE_VECTOR_HASH_INVALID");
    return {
      source: "durable-canvas",
      activeCanvasRevisionId: input.activeCanvasRevisionId,
      documentEpoch: input.documentEpoch,
      stateVectorHash: input.stateVectorHash,
      durableSeq: input.durableSeq,
      nodeId: input.nodeId,
      inputHash: hash({
        nodeId: input.nodeId,
        prompt: input.prompt ?? "",
        inputAssetVersionIds: input.inputAssetVersionIds ?? [],
      }),
      configHash: hash({ parameters: input.parameters ?? {}, stateVectorHash: input.stateVectorHash }),
    };
  }
}

export function hash(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
