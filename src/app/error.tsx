"use client";

import { ErrorPanel } from "@/components/sites/console/error-panel";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPanel error={error} context="route" reset={reset} />;
}
