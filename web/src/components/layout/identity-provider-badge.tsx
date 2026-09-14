import { cn } from "@/lib/utils";

type IdentityUser = { identityProvider?: string; identityUsername?: string };

export function isLinuxDOIdentity(user?: IdentityUser | null) {
    return user?.identityProvider?.trim().toLowerCase() === "linuxdo";
}

const identityMeta: Record<string, { label: string; compactLabel: string }> = {
    linuxdo: { label: "Linux.do", compactLabel: "L" },
    wechat: { label: "微信", compactLabel: "微" },
    douyin: { label: "抖音", compactLabel: "抖" },
};

export function IdentityProviderBadge({ user, compact = false, className }: { user: IdentityUser; compact?: boolean; className?: string }) {
    const provider = user.identityProvider?.trim().toLowerCase() || "";
    const meta = identityMeta[provider];
    if (!meta) return null;
    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center justify-center border border-border bg-background font-semibold text-foreground/65",
                compact ? "size-3.5 rounded-full text-[var(--fs-micro)] leading-none" : "h-4 rounded px-1 text-[var(--fs-micro)] leading-none",
                className,
            )}
            title={user.identityUsername ? `${meta.label} · @${user.identityUsername}` : `${meta.label}用户`}
        >
            {compact ? meta.compactLabel : meta.label}
        </span>
    );
}
