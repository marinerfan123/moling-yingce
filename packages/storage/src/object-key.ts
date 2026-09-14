const opaquePart = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function assertOpaquePart(name: string, value: string): string {
  if (!opaquePart.test(value) || value.includes(".")) {
    throw new Error(`STORAGE_INVALID_${name.toUpperCase()}`);
  }
  return value;
}

/** Builds a stable key from opaque identifiers only. Human supplied names never belong in object keys. */
export function opaqueObjectKey(tenantId: string, objectId: string, variant: string): string {
  return `tenants/${assertOpaquePart("tenant", tenantId)}/objects/${assertOpaquePart("object", objectId)}/variants/${assertOpaquePart("variant", variant)}`;
}

export function quarantineObjectKey(tenantId: string, objectId: string, version: string): string {
  return `quarantine/${opaqueObjectKey(tenantId, objectId, version)}`;
}

export function isQuarantineKey(key: string): boolean {
  return key.startsWith("quarantine/") || /\/variants\/quarantine$/.test(key);
}

export function tenantForObjectKey(key: string): string | undefined {
  const match =
    /^(?:quarantine\/)?tenants\/([^/]+)\/objects\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/variants\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.exec(
      key,
    );
  return match?.[1];
}
