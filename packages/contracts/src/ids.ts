import { z } from "zod";

const opaqueId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[a-zA-Z0-9][a-zA-Z0-9_-]{7,}$`), `${prefix} id must be opaque and prefixed`);

export const TenantIdSchema = opaqueId("tenant");
export const ProjectIdSchema = opaqueId("project");
export const UserIdSchema = opaqueId("user");
export const EventIdSchema = opaqueId("event");
export const JobIdSchema = opaqueId("job");

export type TenantId = z.infer<typeof TenantIdSchema>;
export type ProjectId = z.infer<typeof ProjectIdSchema>;
export type UserId = z.infer<typeof UserIdSchema>;
export type EventId = z.infer<typeof EventIdSchema>;
export type JobId = z.infer<typeof JobIdSchema>;
