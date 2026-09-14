export interface MediaProcessor {
  readonly name: string;
}
const processors: MediaProcessor[] = [];
export function registerMediaProcessor(processor: MediaProcessor): void {
  processors.push(processor);
}
export function mediaProcessors(): readonly MediaProcessor[] {
  return processors;
}

export function registerDefaultMediaProcessors(): void {
  for (const name of [
    "inspect-upload",
    "ingest-remote-source",
    "ingest-provider-output",
    "generate-proxies",
    "moderate-output",
    "promote-ready",
    "abort-abandoned-uploads",
    "transcode-cfr-mezzanine",
  ]) {
    if (!processors.some((processor) => processor.name === name)) processors.push({ name });
  }
}
