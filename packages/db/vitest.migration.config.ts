import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/migrate.test.ts", "test/migration.integration.test.ts"] } });
