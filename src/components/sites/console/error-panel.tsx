"use client";

import { useEffect } from "react";
import { normalizeClientError, reportClientError } from "@/lib/client-error";

export function ErrorPanel({ error, context, reset }: { error: unknown; context: string; reset: () => void }) {
  const normalized = normalizeClientError(error);
  useEffect(() => {
    reportClientError(error, context);
  }, [error, context]);
  return (
    <div className="grid min-h-screen place-items-center bg-white p-6 text-[#16191f]">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold">This page hit a problem</h1>
        <p className="mt-2 text-sm text-[#5f6b7a]">The console could not render this view. Try again to reload it.</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-left text-[13px]">
          <dt className="font-semibold">Error code</dt>
          <dd className="font-mono">{normalized.code}</dd>
          <dt className="font-semibold">Request ID</dt>
          <dd className="font-mono">{normalized.requestId ?? "—"}</dd>
        </dl>
        <button type="button" className="mt-4 h-8 rounded-lg bg-[#ff9900] px-3 text-sm font-semibold" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
