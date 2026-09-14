export const serviceWorkerManifest = Object.freeze({
  cacheName: "comic-canvas-shell-v1",
  strategy: "app-shell-and-immutable-public-assets-only",
  forbidden: ["tokens", "signed-urls", "provider-payloads", "private-project-data"],
} as const);

export function registerRecoveryServiceWorker(
  registrar: { register(path: string): Promise<unknown> } | undefined = globalThis.navigator?.serviceWorker,
) {
  if (!registrar) return Promise.resolve({ registered: false as const });
  return registrar
    .register("/service-worker.js")
    .then(() => ({ registered: true as const, cacheName: serviceWorkerManifest.cacheName }));
}
