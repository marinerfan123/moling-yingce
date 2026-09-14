export function principalFromRequest<T extends { principal?: unknown }>(request: T) {
  if (!request.principal) throw new Error("PRINCIPAL_MISSING");
  return request.principal;
}
