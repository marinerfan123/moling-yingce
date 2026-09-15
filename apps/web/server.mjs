import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative } from "node:path";

const publicRoot = process.env["WEB_DIST_DIR"] ?? join(process.cwd(), "public");
const port = Number(process.env["PORT"] ?? 3000);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

function safePath(urlPath) {
  const requested = decodeURIComponent(urlPath.split("?")[0] || "/");
  const candidate = normalize(join(publicRoot, requested));
  const fromRoot = relative(publicRoot, candidate);
  return fromRoot.startsWith("..") || fromRoot.includes(`..${process.platform === "win32" ? "\\" : "/"}`)
    ? null
    : candidate;
}

async function readAsset(urlPath) {
  const candidate = safePath(urlPath);
  if (!candidate) return null;
  try {
    return await readFile(candidate);
  } catch {
    return urlPath === "/" || !extname(urlPath) ? await readFile(join(publicRoot, "index.html")) : null;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(
      JSON.stringify({
        status: "ok",
        service: "web",
        readiness: "ready",
        version: process.env["RELEASE_SHA"] ?? "local",
      }),
    );
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end();
    return;
  }
  const asset = await readAsset(url.pathname);
  if (!asset) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const contentType = contentTypes.get(extname(url.pathname)) ?? "application/octet-stream";
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": extname(url.pathname) ? "public, max-age=31536000, immutable" : "no-cache",
  });
  if (request.method === "HEAD") response.end();
  else response.end(asset);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`web listening on ${port}`);
});
