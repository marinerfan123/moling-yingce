import { identitySchema } from "./identity.js";
import { auditSchema } from "./audit.js";
import { analyticsSchema } from "./analytics.js";
import { canvasCollabSchema } from "./canvas-collab.js";
import { idempotencySchema } from "./idempotency.js";
import { governanceSchema } from "./governance.js";
import { outboxSchema } from "./outbox.js";
import { narrativeSchema } from "./narrative.js";
import { projectLifecycleSchema } from "./projects.js";
import { assetsSchema } from "./assets.js";
import { modelsSchema } from "./models.js";
import { billingSchema } from "./billing.js";
import { generationSchema } from "./generation.js";
import { selectionsSchema } from "./selections.js";

export const dbSchemas = Object.freeze({
  schemaVersion: 9,
  tables: [
    ...identitySchema.tables.map((table) => table.name),
    ...idempotencySchema.tables,
    ...auditSchema.tables,
    ...analyticsSchema.tables,
    ...outboxSchema.tables,
    ...projectLifecycleSchema.tables,
    ...narrativeSchema.tables,
    ...governanceSchema.tables,
    ...canvasCollabSchema.tables,
    ...assetsSchema.tables,
    ...modelsSchema.tables,
    ...billingSchema.tables,
    ...generationSchema.tables,
    ...selectionsSchema.tables,
  ],
});

export { analyticsSchema } from "./analytics.js";
export { assetsSchema } from "./assets.js";
export { auditSchema } from "./audit.js";
export { billingSchema } from "./billing.js";
export { canvasCollabSchema } from "./canvas-collab.js";
export { governanceSchema } from "./governance.js";
export { identitySchema } from "./identity.js";
export { idempotencySchema } from "./idempotency.js";
export { generationSchema } from "./generation.js";
export { modelsSchema } from "./models.js";
export { narrativeSchema } from "./narrative.js";
export { outboxSchema } from "./outbox.js";
export { episodeCopyPolicyCatalog, projectLifecycleSchema } from "./projects.js";
export { selectionsSchema } from "./selections.js";
