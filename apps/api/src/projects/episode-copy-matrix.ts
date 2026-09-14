export type EpisodeCopyPolicy = "copy_new_id" | "reuse_project_ref" | "exclude" | "requires_contributor";

export type EpisodeCopyPolicyRow = Readonly<{
  tableName: string;
  policy: EpisodeCopyPolicy;
  requiredContributor?: string;
}>;

export const episodeCopyPolicyCatalog: readonly EpisodeCopyPolicyRow[] = Object.freeze([
  { tableName: "episodes", policy: "copy_new_id" },
  { tableName: "scripts", policy: "copy_new_id" },
  { tableName: "script_sources", policy: "copy_new_id" },
  { tableName: "script_revisions", policy: "copy_new_id" },
  { tableName: "script_revision_scenes", policy: "copy_new_id" },
  { tableName: "script_revision_beats", policy: "copy_new_id" },
  { tableName: "script_revision_shots", policy: "copy_new_id" },
  { tableName: "script_revision_lines", policy: "copy_new_id" },
  { tableName: "canvases", policy: "requires_contributor", requiredContributor: "CanvasEpisodeCopyContributor" },
  {
    tableName: "timeline_headers",
    policy: "requires_contributor",
    requiredContributor: "TimelineEpisodeCopyContributor",
  },
  { tableName: "asset_versions", policy: "reuse_project_ref" },
  { tableName: "bible_versions", policy: "reuse_project_ref" },
  { tableName: "font_versions", policy: "reuse_project_ref" },
  { tableName: "jobs", policy: "exclude" },
  { tableName: "attempts", policy: "exclude" },
  { tableName: "batches", policy: "exclude" },
  { tableName: "progress", policy: "exclude" },
  { tableName: "usage_reservations", policy: "exclude" },
  { tableName: "ledger_entries", policy: "exclude" },
  { tableName: "selections", policy: "exclude" },
  { tableName: "approvals", policy: "exclude" },
  { tableName: "comments", policy: "exclude" },
  { tableName: "review_requests", policy: "exclude" },
  { tableName: "decisions", policy: "exclude" },
  { tableName: "issues", policy: "exclude" },
  { tableName: "shares", policy: "exclude" },
  { tableName: "audit_events", policy: "exclude" },
]);

export function assertEveryEpisodeTableCataloged(tableNames: readonly string[]) {
  const cataloged = new Set(episodeCopyPolicyCatalog.map((row) => row.tableName));
  const missing = tableNames.filter((tableName) => !cataloged.has(tableName));
  if (missing.length > 0) throw new Error(`EPISODE_COPY_POLICY_MISSING ${missing.join(",")}`);
  return true;
}

export function excludedCopyKinds() {
  return episodeCopyPolicyCatalog.filter((row) => row.policy === "exclude").map((row) => row.tableName);
}
