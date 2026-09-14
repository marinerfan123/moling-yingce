export class TraceInterceptor {
  createTraceId(seed = Date.now().toString(36)) {
    return `trace_${seed.padStart(8, "0")}`;
  }
}
