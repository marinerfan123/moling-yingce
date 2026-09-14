import type { WebAuthState } from "../auth/auth-session.js";

export const loginRoute = "/login";

export const appRoutes = Object.freeze([
  "/",
  "/governance",
  "/recovery",
  "/projects",
  "/projects/:projectId/episodes/:episodeId/canvas",
  "/projects/:projectId/episodes/:episodeId/storyboard",
  "/projects/:projectId/episodes/:episodeId/timeline",
  "/projects/:projectId/episodes/:episodeId/review",
  "/projects/:projectId/episodes/:episodeId/canvas/editing-contract",
  "/projects/:projectId/episodes/:episodeId/canvas/quick-insert",
  "/projects/:projectId/episodes/:episodeId/assets/upload",
  "/projects/:projectId/episodes/:episodeId/generation/confirm",
] as const);

export function routesForAuth(auth: WebAuthState): readonly string[] {
  return auth.status === "authenticated" ? appRoutes : [loginRoute];
}
