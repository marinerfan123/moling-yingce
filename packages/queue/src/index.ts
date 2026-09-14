export interface QueueRoute {
  readonly name: string;
}
const routes: QueueRoute[] = [];
export function registerQueueRoute(route: QueueRoute): void {
  routes.push(route);
}
export function queueRoutes(): readonly QueueRoute[] {
  return routes;
}

export { createConsumerReceiptStore } from "./consumer-receipt.js";
export { createOutboxDispatcher } from "./outbox-dispatcher.js";
export { reconcileOutbox } from "./outbox-reconciler.js";
export { CanvasProjectionQueue } from "./canvas-projection-queue.js";
export type { CanvasProjectionEvent, ProjectionReceipt } from "./canvas-projection-queue.js";
export type { OutboxEvent, OutboxPayload } from "./outbox-dispatcher.js";
export {
  GENERATION_ROUTES,
  createGenerationQueuePayload,
  generationQueuePayloadKeys,
  generationRedisJobId,
} from "./generation-queue.js";
export type { GenerationQueuePayload, GenerationRoute } from "./generation-queue.js";
export {
  MEDIA_ROUTES,
  createDurableMarkerStore,
  createMediaQueuePayload,
  mediaQueuePayloadKeys,
} from "./media-queue.js";
export type { MediaRoute, MediaQueuePayload } from "./media-queue.js";
export {
  PROVIDER_EVENT_ROUTES,
  createProviderEventQueuePayload,
  providerEventQueuePayloadKeys,
  providerEventRedisJobId,
} from "./provider-event-queue.js";
export type { ProviderEventQueuePayload, ProviderEventQueueRoute } from "./provider-event-queue.js";
