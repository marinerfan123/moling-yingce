import React from "react";

export function AuthCallback({ status }: Readonly<{ status: "loading" | "success" | "failed" }>) {
  return <main>{status === "success" ? "登录完成" : status === "failed" ? "登录失败" : "登录中"}</main>;
}
