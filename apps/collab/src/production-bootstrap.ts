export type CollabProductionDependencies = Readonly<{
  runtimeProfile: "reference";
  websocket: "not_configured";
}>;

/** Keeps the health endpoint honest until the Hocuspocus adapter is wired. */
export function createProductionCollabDependencies(): CollabProductionDependencies {
  return { runtimeProfile: "reference", websocket: "not_configured" };
}
