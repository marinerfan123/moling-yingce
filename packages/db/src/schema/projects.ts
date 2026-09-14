export const projectLifecycleSchema = Object.freeze({
  tables: [
    "project_heads",
    "episodes",
    "canvases",
    "canvas_session_revisions",
    "timeline_headers",
    "episode_copy_previews",
    "episode_copy_policy_catalog",
    "episode_archive_blockers",
  ],
});

export const episodeCopyPolicyCatalog = Object.freeze({
  version: 1,
  copiedWithNewIds: ["episode", "script", "script_source", "script_revision", "scene", "beat", "shot", "line"],
  reusedProjectRefs: ["asset_version", "bible_version", "font_version"],
  excluded: [
    "job",
    "attempt",
    "batch",
    "progress",
    "usage_reservation",
    "ledger",
    "selection",
    "approval",
    "comment",
    "review_request",
    "decision",
    "issue",
    "share",
    "audit",
  ],
});
