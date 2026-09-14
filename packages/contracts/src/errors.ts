import { z } from "zod";

export const StableErrorCodeSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{2,63}$/, "error code must be stable SCREAMING_SNAKE_CASE");

export const TraceIdSchema = z.string().regex(/^trace_[a-zA-Z0-9_-]{8,}$/);

export const ApiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: StableErrorCodeSchema,
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  traceId: TraceIdSchema,
});

export const TraceEnvelopeSchema = z.object({
  traceId: TraceIdSchema,
  spanId: z.string().min(1).optional(),
});

export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;
export type TraceEnvelope = z.infer<typeof TraceEnvelopeSchema>;
