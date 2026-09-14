export interface GenerationAdapter {
  readonly name?: string;
  readonly providerKey?: string;
}
export interface RegisteredProviderExecutionAdapter extends GenerationAdapter {
  readonly providerKey: string;
}
const adapters: GenerationAdapter[] = [];
export function registerGenerationAdapter(adapter: GenerationAdapter): void {
  adapters.push(adapter);
}
export function generationAdapters(): readonly GenerationAdapter[] {
  return adapters;
}

const productionAdapters: GenerationAdapter[] = [];

export function productionProviderAdapters(): readonly GenerationAdapter[] {
  return productionAdapters;
}

export function providerExecutionAdapter(providerKey: string): RegisteredProviderExecutionAdapter | undefined {
  return generationAdapters().find(
    (adapter): adapter is RegisteredProviderExecutionAdapter => adapter.providerKey === providerKey,
  );
}
