import type { Metadata } from "next";
import "./globals.css";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { identityFromSession } from "@/lib/vws-api/adapter";
import { signedInSession } from "@/lib/vws-api/client";

export const metadata: Metadata = {
  title: "VWS console",
  description: "Mock cloud console with local sample data.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const identity = identityFromSession(await signedInSession());
  return (
    <html lang="en" className="h-full antialiased">
      <body className="console min-h-full">
        <ConsoleProvider identity={identity}>{children}</ConsoleProvider>
      </body>
    </html>
  );
}
