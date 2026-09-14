export type BetaAccessMode = "off" | "allowlist" | "open";

export type BetaAccessEntry = Readonly<{
  subject: string;
  state: "granted" | "revoked";
  expiresAt?: Date;
}>;

export class BetaAccessService {
  constructor(private readonly entries: readonly BetaAccessEntry[] = []) {}

  canAccess(mode: BetaAccessMode, subject: string, now = new Date()): boolean {
    if (mode === "off" || mode === "open") return true;
    const entry = this.entries.find((item) => item.subject === subject);
    return Boolean(entry && entry.state === "granted" && (!entry.expiresAt || entry.expiresAt > now));
  }
}
