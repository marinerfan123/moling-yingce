import { createHash } from "node:crypto";

import {
  assertEveryEpisodeTableCataloged,
  episodeCopyPolicyCatalog,
  excludedCopyKinds,
} from "./episode-copy-matrix.js";
import { EpisodeLifecycleRegistry } from "./episode-lifecycle.registry.js";

export type ProjectRole = "Owner" | "Editor" | "Generator" | "Commenter" | "Viewer";
export type Principal = Readonly<{
  tenantId: string;
  userId: string;
  memberships: readonly { projectId: string; role: ProjectRole; active: boolean }[];
}>;

export type ProjectRecord = Readonly<{
  id: string;
  tenantId: string;
  title: string;
  ownerUserId: string;
  archivedAt: string | null;
  createdAt: string;
}>;
export type EpisodeRecord = Readonly<{
  id: string;
  tenantId: string;
  projectId: string;
  title: string;
  ordinal: number;
  canvasId: string;
  timelineId: string;
  scriptId: string;
  archivedAt: string | null;
}>;

const nowIso = () => new Date().toISOString();
const id = (prefix: string, seed: string) =>
  `${prefix}_${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
export const sha256 = (value: unknown) =>
  `sha256:${createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex")}`;

export class ProjectsService {
  readonly #projects = new Map<string, ProjectRecord>();
  readonly #episodes = new Map<string, EpisodeRecord>();
  readonly #memberships = new Map<string, ProjectRole>();
  readonly #previews = new Map<
    string,
    { preview: ReturnType<ProjectsService["previewEpisodeCopy"]>; sourceHeadHash: string }
  >();

  constructor(private readonly lifecycle = new EpisodeLifecycleRegistry()) {
    this.lifecycle.registerCopyContributor({
      name: "CanvasEpisodeCopyContributor",
      copy: ({ operationId, remap }) => ({ contributor: "CanvasEpisodeCopyContributor", oldToNewIdMap: remap }),
    });
    this.lifecycle.registerCopyContributor({
      name: "TimelineEpisodeCopyContributor",
      copy: ({ operationId, remap }) => ({ contributor: "TimelineEpisodeCopyContributor", oldToNewIdMap: remap }),
    });
  }

  createProject(principal: Omit<Principal, "memberships">, input: { title: string; firstEpisodeTitle?: string }) {
    const projectId = id("project", `${principal.tenantId}:${principal.userId}:${input.title}`);
    const episodeId = id("episode", `${projectId}:episode:1`);
    const project: ProjectRecord = {
      id: projectId,
      tenantId: principal.tenantId,
      title: input.title.trim(),
      ownerUserId: principal.userId,
      archivedAt: null,
      createdAt: nowIso(),
    };
    const episode: EpisodeRecord = {
      id: episodeId,
      tenantId: principal.tenantId,
      projectId,
      title: input.firstEpisodeTitle?.trim() || "第 1 集",
      ordinal: 1,
      canvasId: id("canvas", episodeId),
      timelineId: id("timeline", episodeId),
      scriptId: id("script", episodeId),
      archivedAt: null,
    };
    this.#projects.set(projectId, project);
    this.#episodes.set(episodeId, episode);
    this.#memberships.set(`${principal.tenantId}:${projectId}:${principal.userId}`, "Owner");
    return { project, firstEpisode: episode };
  }

  listProjects(principal: Principal) {
    const allowed = new Set(principal.memberships.filter((item) => item.active).map((item) => item.projectId));
    return [...this.#projects.values()].filter(
      (project) => project.tenantId === principal.tenantId && allowed.has(project.id),
    );
  }

  listProjectsForUser(principal: Omit<Principal, "memberships">) {
    return [...this.#projects.values()].filter(
      (project) => project.tenantId === principal.tenantId && project.ownerUserId === principal.userId,
    );
  }

  assertProjectAccess(principal: Principal, projectId: string, minimum: "view" | "edit" | "admin" = "view") {
    const project = this.#projects.get(projectId);
    if (!project || project.tenantId !== principal.tenantId) throw new Error("PROJECT_NOT_FOUND");
    const membership = principal.memberships.find((item) => item.projectId === projectId && item.active);
    if (!membership) throw new Error("PROJECT_MEMBERSHIP_MISSING");
    if (minimum === "edit" && !["Owner", "Editor"].includes(membership.role)) throw new Error("PROJECT_EDIT_DENIED");
    if (minimum === "admin" && membership.role !== "Owner") throw new Error("PROJECT_ADMIN_DENIED");
    return project;
  }

  renameEpisode(principal: Principal, episodeId: string, title: string) {
    const episode = this.requireEpisode(episodeId);
    this.assertProjectAccess(principal, episode.projectId, "edit");
    const renamed = { ...episode, title: title.trim() };
    this.#episodes.set(episodeId, renamed);
    return renamed;
  }

  archiveEpisode(principal: Principal, episodeId: string) {
    const episode = this.requireEpisode(episodeId);
    this.assertProjectAccess(principal, episode.projectId, "admin");
    this.lifecycle.assertCanArchive(episodeId);
    const archived = { ...episode, archivedAt: nowIso() };
    this.#episodes.set(episodeId, archived);
    return archived;
  }

  restoreEpisode(principal: Principal, episodeId: string) {
    const episode = this.requireEpisode(episodeId);
    this.assertProjectAccess(principal, episode.projectId, "admin");
    const restored = { ...episode, archivedAt: null };
    this.#episodes.set(episodeId, restored);
    return restored;
  }

  previewEpisodeCopy(principal: Principal, episodeId: string, operationId = "op_copypreview01") {
    const source = this.requireEpisode(episodeId);
    this.assertProjectAccess(principal, source.projectId, "edit");
    assertEveryEpisodeTableCataloged(episodeCopyPolicyCatalog.map((row) => row.tableName));
    for (const row of episodeCopyPolicyCatalog.filter((item) => item.policy === "requires_contributor")) {
      this.lifecycle.requireContributor(row.requiredContributor ?? "");
    }
    const remap = {
      [source.id]: id("episode", `${operationId}:${source.id}`),
      [source.canvasId]: id("canvas", `${operationId}:${source.canvasId}`),
      [source.timelineId]: id("timeline", `${operationId}:${source.timelineId}`),
      [source.scriptId]: id("script", `${operationId}:${source.scriptId}`),
    };
    const sourceHeadHash = sha256(source);
    const preview = {
      previewId: id("copyprev", `${operationId}:${source.id}`),
      sourceEpisodeId: source.id,
      sourceHeadHash,
      policyHash: sha256(episodeCopyPolicyCatalog),
      copyPolicyVersion: 1 as const,
      remap,
      excludedKinds: excludedCopyKinds(),
      reusableProjectRefs: [],
    };
    this.#previews.set(preview.previewId, { preview, sourceHeadHash });
    return preview;
  }

  confirmEpisodeCopy(
    principal: Principal,
    input: { previewId: string; expectedSourceHeadHash: string; operationId: string },
  ) {
    const stored = this.#previews.get(input.previewId);
    if (!stored) throw new Error("EPISODE_COPY_PREVIEW_MISSING");
    if (stored.sourceHeadHash !== input.expectedSourceHeadHash) throw new Error("EPISODE_COPY_SOURCE_CHANGED");
    const source = this.requireEpisode(stored.preview.sourceEpisodeId);
    this.assertProjectAccess(principal, source.projectId, "edit");
    const copied: EpisodeRecord = {
      ...source,
      id: stored.preview.remap[source.id] ?? id("episode", `${input.operationId}:${source.id}`),
      canvasId: stored.preview.remap[source.canvasId] ?? id("canvas", `${input.operationId}:${source.canvasId}`),
      timelineId:
        stored.preview.remap[source.timelineId] ?? id("timeline", `${input.operationId}:${source.timelineId}`),
      scriptId: stored.preview.remap[source.scriptId] ?? id("script", `${input.operationId}:${source.scriptId}`),
      title: `${source.title} 副本`,
      ordinal: this.nextEpisodeOrdinal(source.projectId),
      archivedAt: null,
    };
    this.#episodes.set(copied.id, copied);
    return { episode: copied, remap: stored.preview.remap, excludedKinds: stored.preview.excludedKinds };
  }

  getEpisode(episodeId: string) {
    return this.requireEpisode(episodeId);
  }

  private requireEpisode(episodeId: string) {
    const episode = this.#episodes.get(episodeId);
    if (!episode) throw new Error("EPISODE_NOT_FOUND");
    return episode;
  }

  private nextEpisodeOrdinal(projectId: string) {
    return 1 + [...this.#episodes.values()].filter((episode) => episode.projectId === projectId).length;
  }
}
