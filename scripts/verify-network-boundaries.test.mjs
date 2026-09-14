import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("gateway, TLS, SSE, websocket and egress boundaries are declared", () => {
  const controller = JSON.parse(readFileSync("infra/deploy/kubernetes/base/gateway-controller-profile.json", "utf8"));
  assert.equal(controller.controllerName, "gateway.networking.k8s.io/comic-canvas-managed");
  assert.equal(controller.websocket.keepaliveSeconds, 20);
  assert.equal(controller.websocket.idleTimeoutSeconds, 120);
  assert.equal(controller.sse.buffering, false);
  assert.equal(controller.sse.heartbeatSeconds, 15);
  assert.equal(controller.sse.streamTimeoutMinutes, 15);

  const gateway = readFileSync("infra/deploy/kubernetes/base/gateway.yaml", "utf8");
  assert.match(gateway, /protocol: HTTPS/);
  assert.match(gateway, /certificateRefs/);

  const policies = readFileSync("infra/deploy/kubernetes/base/network-policies.yaml", "utf8");
  assert.match(policies, /default-deny/);
  assert.match(policies, /safe-fetch-proxy/);
  assert.match(policies, /controlled-egress/);

  const matrix = JSON.parse(readFileSync("infra/deploy/kubernetes/base/network-policy-matrix.json", "utf8"));
  assert.equal(matrix.applicationsHaveNoDirectInternet, true);
  assert.equal(matrix.onlyMediaCanReachSafeFetch, true);
  assert.deepEqual(matrix.forbiddenDispatcherCredentials, [
    "GENERATION_SUBMIT_KMS_KEY_ID",
    "WEBHOOK_VERIFICATION_KMS_KEY_ID",
    "API_COLLAB_SESSION_PRIVATE_JWK_FILE",
  ]);
});
