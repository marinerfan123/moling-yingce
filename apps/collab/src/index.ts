export const collabServiceName = "collab";
export function bootstrapCollab() {
  return { service: collabServiceName };
}

export { buildCollabHealth, startCollabHealthServer } from "./health.js";
export { createProductionCollabDependencies } from "./production-bootstrap.js";
