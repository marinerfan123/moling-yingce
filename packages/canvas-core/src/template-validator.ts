import { createNodeRegistry, type NodeRegistry } from "./node-registry.js";
import type { CanvasTemplate } from "./templates/vertical-comic.js";

export type TemplateDiagnostic = Readonly<{ code: string; message: string; nodeId?: string; edgeId?: string }>;

export function validateTemplate(
  template: CanvasTemplate,
  registry: NodeRegistry = createNodeRegistry(),
): readonly TemplateDiagnostic[] {
  const diagnostics: TemplateDiagnostic[] = [];
  const nodes = new Map(template.nodes.map((node) => [node.id, node]));
  for (const node of template.nodes) {
    const definition = registry.get(node.kind);
    if (!definition || node.kind === "unknown") {
      diagnostics.push({
        code: "UNKNOWN_NODE_KIND",
        nodeId: node.id,
        message: `Template contains unknown node kind ${node.kind}`,
      });
    }
  }
  for (const edge of template.edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    const sourceDefinition = source && registry.get(source.kind);
    const targetDefinition = target && registry.get(target.kind);
    if (!source || !target) {
      diagnostics.push({
        code: "MISSING_ENDPOINT",
        edgeId: edge.id,
        message: `Edge ${edge.id} references a missing endpoint`,
      });
      continue;
    }
    const sourcePort = sourceDefinition?.outputs.find((port) => port.id === edge.sourcePort);
    const targetPort = targetDefinition?.inputs.find((port) => port.id === edge.targetPort);
    if (!sourcePort || !targetPort) {
      diagnostics.push({
        code: "INVALID_PORT",
        edgeId: edge.id,
        message: `Edge ${edge.id} references an invalid port`,
      });
      continue;
    }
    if (edge.kind !== "reference" && sourcePort.type !== targetPort.type) {
      diagnostics.push({
        code: "PORT_MISMATCH",
        edgeId: edge.id,
        message: `Edge ${edge.id} connects ${sourcePort.type} to ${targetPort.type}`,
      });
    }
  }
  if (template.capabilities.length > 0)
    diagnostics.push({ code: "CAPABILITY_FORBIDDEN", message: "Built-in templates cannot request capabilities" });
  if (template.createsJobs)
    diagnostics.push({ code: "JOB_CREATION_FORBIDDEN", message: "Templates cannot create jobs" });
  for (const proposal of template.proposals) {
    if (proposal.type !== "node.add" && proposal.type !== "edge.connect")
      diagnostics.push({ code: "PROPOSAL_FORBIDDEN", message: "Template proposals must be CanvasCommand additions" });
  }
  return diagnostics;
}

export function assertValidTemplate(template: CanvasTemplate, registry?: NodeRegistry): CanvasTemplate {
  const diagnostics = validateTemplate(template, registry);
  if (diagnostics.length > 0) throw new Error(diagnostics.map((diagnostic) => diagnostic.message).join("; "));
  return template;
}
