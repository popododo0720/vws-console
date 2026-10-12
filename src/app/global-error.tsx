"use client";

import { ErrorPanel } from "@/components/sites/console/error-panel";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <ErrorPanel error={error} context="root-layout" reset={reset} />
      </body>
    </html>
  );
}
