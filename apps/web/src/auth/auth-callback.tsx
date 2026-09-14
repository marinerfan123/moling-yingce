import React from "react";

import type { AuthSessionClient } from "./auth-session.js";
import { OidcMemoryClient, type OidcTokens } from "./oidc-client.js";

export type AuthCallbackResult = Readonly<{ status: "success" }> | Readonly<{ status: "failed"; reason: string }>;

export type AuthorizationCodeExchange = (parameters: URLSearchParams) => Promise<OidcTokens>;

export async function completeAuthCallback(
  input: Readonly<{
    search: string;
    exchangeCode: AuthorizationCodeExchange;
    oidcClient: OidcMemoryClient;
    authSessionClient: Pick<AuthSessionClient, "establish">;
  }>,
): Promise<AuthCallbackResult> {
  const parameters = new URLSearchParams(input.search.startsWith("?") ? input.search.slice(1) : input.search);
  const providerError = parameters.get("error");
  if (providerError) return { status: "failed", reason: providerError };
  if (!parameters.get("code")) return { status: "failed", reason: "AUTHORIZATION_CODE_MISSING" };

  try {
    const tokens = await input.exchangeCode(parameters);
    input.oidcClient.setTokens(tokens);
    await input.oidcClient.establishServerSession((accessToken) => input.authSessionClient.establish(accessToken));
    return { status: "success" };
  } catch {
    input.oidcClient.logout();
    return { status: "failed", reason: "AUTH_CALLBACK_FAILED" };
  }
}

export function AuthCallback({ status }: Readonly<{ status: "loading" | "success" | "failed" }>) {
  return <main>{status === "success" ? "登录完成" : status === "failed" ? "登录失败" : "登录中"}</main>;
}
