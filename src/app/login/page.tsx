import type { Metadata } from "next";
import { LoginView } from "@/components/sites/console/login-view";
import { redirect } from "next/navigation";
import { iamState } from "@/lib/vws-api/mode";
import { safeNext } from "@/lib/vws-api/session-cookies";

export const metadata: Metadata = { title: "Sign in · VWS" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // With IAM off there is no sign-in; the console works with the server-side token.
  if ((await iamState()) === "off") redirect(safeNext(params.next));
  return <LoginView next={safeNext(params.next)} expired={params.reason === "expired"} />;
}
