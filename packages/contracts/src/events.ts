import { z } from "zod";

import { EventIdSchema, ProjectIdSchema } from "./ids.js";

export const IsoDateTimeSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "must be ISO datetime");

export const ProjectEventSchema = z.object({
  projectId: ProjectIdSchema,
  eventId: EventIdSchema,
  jobSequence: z.number().int().nonnegative().optional(),
  occurredAt: IsoDateTimeSchema,
  type: z.string().min(1),
  data: z.unknown(),
});

export interface ProjectEvent<T> {
  projectId: string;
  eventId: string;
  jobSequence?: number;
  occurredAt: string;
  type: string;
  data: T;
}
