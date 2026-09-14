export interface MigrationResult {
  applied: number;
}

export async function migrate(): Promise<MigrationResult> {
  return { applied: 0 };
}
