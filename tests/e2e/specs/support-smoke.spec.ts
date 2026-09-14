import { expect, test } from "../support/fixtures.js";

test("support smoke: commercial flow drivers are discoverable", async ({
  project,
  story,
  bibles,
  generation,
  storyboard,
  timeline,
  exportFlow,
}) => {
  const created = await project.create();
  const episode = await story.draftEpisode();
  const character = await bibles.createCharacter();
  const job = await generation.requestImage();
  const frame = await storyboard.createFrame();
  const clip = await timeline.addClip();
  const exported = await exportFlow.requestExport(created.id);

  expect(created.id).toContain("project-");
  expect(episode.scenes).toBeGreaterThan(0);
  expect(character.id).toContain("character-");
  expect(job.jobId).toBe("job-image-1");
  expect(frame.sceneId).toBe("scene-1");
  expect(clip.fps).toBe(25);
  expect(exported.status).toBe("queued");
});
