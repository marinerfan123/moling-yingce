import { readFileSync } from "node:fs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

const args = new Map(
  process.argv
    .slice(2)
    .map((value, index, all) => (value.startsWith("--") ? [value, all[index + 1] ?? "true"] : ["", ""])),
);
const realm = readJson(args.get("--realm") ?? "infra/docker/keycloak/realm.json");
const clients = readJson(args.get("--clients") ?? "infra/docker/keycloak/clients.json");
const users = readJson(args.get("--users") ?? "infra/docker/keycloak/test-users.json");
const allowlist = readJson(args.get("--allowlist") ?? "infra/docker/keycloak/allowlist-seed.json");

if (realm.realm !== "comic-canvas-test") throw new Error("KEYCLOAK_REALM_MISMATCH");
const clientIds = new Set(clients.clients.map((client) => client.clientId));
for (const required of ["comic-web", "comic-api", "comic-collab"]) {
  if (!clientIds.has(required)) throw new Error(`KEYCLOAK_CLIENT_MISSING ${required}`);
}
const roles = new Set(users.users.flatMap((user) => user.roles));
for (const role of ["Owner", "Editor", "Generator", "Commenter", "Viewer"]) {
  if (!roles.has(role)) throw new Error(`KEYCLOAK_ROLE_MISSING ${role}`);
}
if (!allowlist.allowlist.every((email) => email.endsWith(".test"))) {
  throw new Error("ALLOWLIST_CONTAINS_NON_TEST_EMAIL");
}
console.log("keycloak seed validation passed");
