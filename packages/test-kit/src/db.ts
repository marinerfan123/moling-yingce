import type { DbTestContext } from "./protocols.js";

let counter = 0;

export async function createDbTestContext(): Promise<DbTestContext> {
  counter += 1;
  const suffix = `${Date.now()}-${counter}`;
  const db = new Map<string, unknown>();
  const adminDb = new Map<string, unknown>();
  const context: DbTestContext = {
    ids: {
      tenantId: `tenant-test-${suffix}`,
      projectId: `project-test-${suffix}`,
    },
    fixture: {
      projectName: `Comic Canvas Test Project ${suffix}`,
    },
    db,
    adminDb,
    scopes: {
      tenant: {
        tenantId: `tenant-test-${suffix}`,
        subject: `subject-${suffix}`,
        requestId: `request-${suffix}`,
      },
      project: {
        tenantId: `tenant-test-${suffix}`,
        projectId: `project-test-${suffix}`,
        subject: `subject-${suffix}`,
        requestId: `request-${suffix}`,
      },
    },
    cleanup: async () => {
      db.clear();
      adminDb.clear();
    },
  };
  return context;
}
