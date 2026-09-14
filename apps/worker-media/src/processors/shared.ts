export type ShellCommand = Readonly<{ file: "ffprobe" | "ffmpeg" | "clamscan"; shell: false; args: readonly string[] }>;
export type MarkerStore = {
  has(eventId: string, step: string): boolean;
  get(eventId: string, step: string): unknown;
  mark(eventId: string, step: string, value?: unknown): { inserted: boolean; value: unknown };
};
export type ProcessorContext = Readonly<{ eventId: string; markerStore?: MarkerStore }>;
function ephemeralMarkers(): MarkerStore {
  const values = new Map<string, unknown>();
  return {
    has: (e, s) => values.has(`${e}:${s}`),
    get: (e, s) => values.get(`${e}:${s}`),
    mark: (e, s, value = true) => {
      const key = `${e}:${s}`;
      if (values.has(key)) return { inserted: false, value: values.get(key) };
      values.set(key, value);
      return { inserted: true, value };
    },
  };
}
export function once<T>(ctx: ProcessorContext, step: string, effect: () => T): T {
  const store = ctx.markerStore ?? ephemeralMarkers();
  const old = store.get(ctx.eventId, step);
  if (old !== undefined) return old as T;
  const result = effect();
  store.mark(ctx.eventId, step, result);
  return result;
}
export function safeLocatorDiagnostic(locator: string): string {
  return locator.replace(/https?:\/\/[^\s]+/gi, "[redacted-url]");
}
export function command(file: ShellCommand["file"], args: readonly string[]): ShellCommand {
  return { file, shell: false, args: [...args] };
}
