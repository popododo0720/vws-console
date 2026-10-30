import type { Metadata } from "next";
import "./globals.css";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { identityFromSession } from "@/lib/vws-api/adapter";
import { listBuckets, signedInSession } from "@/lib/vws-api/client";
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
  const state = await iamState();
  const signIn = state === "on";
  const session = await signedInSession();
  const identity = identityFromSession(session, { iam: state !== "off" });
  const listed = session ? await listBuckets() : null;
  const accountBuckets = listed?.ok ? listed.value : [];
  return (
    <html lang="en" className="h-full antialiased">
      <body className="console min-h-full">
        <ConsoleProvider identity={identity} signIn={signIn} accountBuckets={accountBuckets}>
          {children}
        </ConsoleProvider>
      </body>
    </html>
  );
}
