import { routesForAuth } from "./app/router.js";
import {
  AuthSessionClient,
  hydrateWebSession,
  type AuthSessionReader,
  type WebAuthState,
} from "./auth/auth-session.js";
import { registerRecoveryServiceWorker } from "./offline/service-worker.js";

export function mountWebApp(auth: WebAuthState = { status: "anonymous", user: null }): readonly string[] {
  return routesForAuth(auth);
}

export async function bootstrapWebApp(client: AuthSessionReader = new AuthSessionClient()): Promise<{
  routes: readonly string[];
  auth: WebAuthState;
}> {
  const auth = await hydrateWebSession(client);
  return { routes: routesForAuth(auth), auth };
}

export async function mountOfflineRecovery() {
  return registerRecoveryServiceWorker();
}
