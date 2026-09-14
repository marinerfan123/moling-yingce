export function assertOwnerRpcIdentity(identity: string) {
  if (identity !== "collab-owner-mtls") throw new Error("OWNER_RPC_IDENTITY_INVALID");
  return true;
}
