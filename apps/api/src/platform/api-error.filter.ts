export class ApiErrorFilter {
  toEnvelope(error: unknown, traceId: string) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return {
      error: {
        code: "INTERNAL_ERROR",
        message: message.includes("provider") ? "Internal error" : message,
      },
      traceId,
    };
  }
}
