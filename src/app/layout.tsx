import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { identityFromSession } from "@/lib/vws-api/adapter";
import { getAdminPermissions, listBuckets, listRegions, signedInSession } from "@/lib/vws-api/client";
import { iamState } from "@/lib/vws-api/mode";

export const metadata: Metadata = {
  title: "VWS console",
  description: "Mock cloud console with local sample data.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Everything here is the caller's own at this moment, so no page may be rendered ahead of its request.
  await connection();
  const state = await iamState();
  const signIn = state === "on";
  const session = await signedInSession();
  const identity = identityFromSession(session, { iam: state !== "off" });
  // With IAM on and no session there is nobody to ask for; with it off the token asks, or the sample region answers.
  const [listed, adminActions, regions] = session
    ? await Promise.all([listBuckets(), getAdminPermissions(), listRegions()])
    : [null, [], state === "off" ? await listRegions() : null];
  const accountBuckets = listed?.ok ? listed.value : [];
  return (
    <html lang="en" className="h-full antialiased">
      <body className="console min-h-full">
        <ConsoleProvider
          identity={identity}
          signIn={signIn}
          accountBuckets={accountBuckets}
          adminActions={adminActions}
          regions={regions}
        >
          {children}
        </ConsoleProvider>
      </body>
    </html>
  );
}
