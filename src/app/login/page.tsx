import type { Metadata } from "next";
import { LoginView } from "@/components/sites/console/login-view";
import { safeNext } from "@/lib/vws-api/session-cookies";

export const metadata: Metadata = { title: "Sign in · VWS" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <LoginView next={safeNext(params.next)} expired={params.reason === "expired"} />;
}
