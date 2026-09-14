import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outDir = "tests/fixtures/generated";
await mkdir(outDir, { recursive: true });

const fixtures = [
  { path: "tone-1s.wav", mime: "audio/wav", durationSeconds: 1, content: "RIFF-comic-canvas-test-wav-1s" },
  {
    path: "clip-1s-25fps.mp4",
    mime: "video/mp4",
    durationSeconds: 1,
    fps: 25,
    content: "ftyp-comic-canvas-test-mp4-1s-25fps",
  },
  { path: "frame-1080x1920.png", mime: "image/png", width: 1080, height: 1920, content: "PNG-comic-canvas-test-frame" },
  {
    path: "caption.srt",
    mime: "application/x-subrip",
    durationSeconds: 1,
    content: "1\n00:00:00,000 --> 00:00:01,000\nComic Canvas\n",
  },
];

const manifest = { schemaVersion: 1, generated: [] };

for (const fixture of fixtures) {
  const bytes = Buffer.from(fixture.content);
  await writeFile(join(outDir, fixture.path), bytes);
  manifest.generated.push({
    path: `tests/fixtures/generated/${fixture.path}`,
    mime: fixture.mime,
    bytes: bytes.length,
    durationSeconds: fixture.durationSeconds,
    width: fixture.width,
    height: fixture.height,
    fps: fixture.fps,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    rightsEvidenceId: "rights-test-original-001",
  });
}

await writeFile("tests/fixtures/fixture-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`generated ${manifest.generated.length} media fixtures`);
