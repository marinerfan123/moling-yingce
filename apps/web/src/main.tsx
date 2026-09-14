import { appRoutes } from "./app/router.js";
import { registerRecoveryServiceWorker } from "./offline/service-worker.js";

export function mountWebApp(): readonly string[] {
  return appRoutes;
}

export async function mountOfflineRecovery() {
  return registerRecoveryServiceWorker();
}
