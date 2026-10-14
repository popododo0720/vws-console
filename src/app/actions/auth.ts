"use server";

import { redirect } from "next/navigation";
import * as vws from "@/lib/vws-api/client";
import { clearSession, storeSession } from "@/lib/vws-api/session";
import { iamEnabled } from "@/lib/vws-api/mode";
import { safeNext } from "@/lib/vws-api/session-cookies";

/** On success `next` is the page to open; the form loads it as a full page so the layout reads the new session. */
export type LoginState = { error: string | null; next?: string };

/** Signs in through console-api and keeps its session in this console's httpOnly cookies. */
export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const input = { account: field("account").trim(), userName: field("userName").trim(), password: field("password"), mfaCode: field("mfaCode").trim() };
  if (!input.account || !input.userName || !input.password) return { error: "Enter the account, user name and password." };
  const result = await vws.login({ ...input, mfaCode: input.mfaCode || undefined });
  if (!result.ok) {
    // console-api gives one message for every bad sign-in, so the console does not reveal which part was wrong.
    if (result.error.code === "ServiceUnavailable" || result.error.code === "ConsoleNotConfigured") return { error: result.error.message };
    return { error: "Sign-in failed. Check the account, user name and password, and try again." };
  }
  await storeSession(result.value);
  return { error: null, next: safeNext(field("next")) };
}

export async function logoutAction() {
  if (!(await iamEnabled())) redirect("/");
  await vws.logout();
  await clearSession();
  redirect("/login");
}
