import React from "react";

export function EpisodeSelector({ episodes }: Readonly<{ episodes: readonly { id: string; title: string }[] }>) {
  return (
    <select aria-label="选择剧集">
      {episodes.map((episode) => (
        <option key={episode.id} value={episode.id}>
          {episode.title}
        </option>
      ))}
    </select>
  );
}
