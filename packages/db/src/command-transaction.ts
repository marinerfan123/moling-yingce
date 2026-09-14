import { AsyncLocalStorage } from "node:async_hooks";

export type CommandTransactionContext = Readonly<{
  traceId: string;
  tenantId: string;
  actorId: string;
  effects: string[];
}>;

export const commandTransactionStorage = new AsyncLocalStorage<CommandTransactionContext>();

export async function runCommandTransaction<T>(
  context: Omit<CommandTransactionContext, "effects">,
  fn: () => Promise<T>,
): Promise<T> {
  return commandTransactionStorage.run({ ...context, effects: [] }, fn);
}

export function currentCommandTransaction() {
  return commandTransactionStorage.getStore();
}
