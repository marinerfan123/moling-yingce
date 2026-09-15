#!/usr/bin/env node

import { readFileSync } from "node:fs";

const path = "infra/deploy/host/tv.moling.fun.conf";
const config = readFileSync(path, "utf8");
const required = [
  "server_name tv.moling.fun",
  "127.0.0.1:3300",
  "proxy_http_version 1.1",
  "proxy_set_header Upgrade",
  "proxy_set_header Connection",
  "proxy_buffering off",
  "proxy_request_buffering off",
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "return 301 https://tv.moling.fun$request_uri",
  "listen 443 ssl http2",
  "/.well-known/acme-challenge/",
];
const missing = required.filter((value) => !config.includes(value));
if (missing.length > 0) {
  console.error(`nginx site verification: FAILED (${missing.join(", ")})`);
  process.exitCode = 1;
} else if (config.includes("http2 on;")) {
  console.error("nginx site verification: FAILED (use listen ... http2 for older Nginx compatibility)");
  process.exitCode = 1;
} else {
  const obsolete = ["127.0.0.1:3301", "127.0.0.1:3302"];
  const foundObsolete = obsolete.filter((value) => config.includes(value));
  if (foundObsolete.length > 0) {
    console.error(`nginx site verification: FAILED (obsolete upstreams: ${foundObsolete.join(", ")})`);
    process.exitCode = 1;
  } else {
    console.log("nginx site verification: PASS");
  }
}
