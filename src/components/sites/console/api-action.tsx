"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApiError } from "@/lib/vws-api/adapter";
import { cn } from "@/lib/utils";

export const UNREACHABLE: ApiError = {
  code: "Unavailable",
  message: "The request did not reach the server. Check your connection and try again.",
  requestId: null,
};

/** What a view says about the operation it starts: while it runs, and once it has succeeded. */
export type OperationText = { running: string; succeeded?: string };

export function useApiAction() {
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [label, setLabel] = useState<OperationText | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ApiError | null>, onDone?: () => void, text: OperationText | null = null) => {
    // Outside the transition, where React would hold them back until the action has finished.
    setLabel(text);
    setError(null);
    startTransition(async () => {
      const failure = await action().catch(() => UNREACHABLE);
      setError(failure);
      if (!failure) {
        onDone?.();
        router.refresh();
      }
    });
  };
  const clear = () => setError(null);
  // A server action returns only when console-api's Operation has left "running", so pending is that state.
  const shown = error ? undefined : pending ? label?.running : label?.succeeded;
  const operation = shown ? ({ state: pending ? "running" : "succeeded", text: shown } as const) : null;
  return { error, pending, run, clear, refresh: () => router.refresh(), operation };
}

/**
 * The state of the operation a view started. The wrapper is always rendered, so a screen reader announces the text
 * when it appears. A failed operation is the view's ApiErrorAlert.
 */
export function OperationStatus({ operation }: { operation: ReturnType<typeof useApiAction>["operation"] }) {
  return (
    <div role="status">
      {operation ? (
        <p
          className={cn(
            "mx-4 my-2 rounded-lg border px-3 py-2 text-[13px]",
            operation.state === "running"
              ? "border-[#006ce0] bg-[#f2f8fd] text-[#16191f]"
              : "border-[#037f0c] bg-[#f2fcf3] text-[#037f0c]",
          )}
        >
          {operation.text}
        </p>
      ) : null}
    </div>
  );
}

export function ApiErrorAlert({ error, title }: { error: ApiError | null; title: string }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="mx-4 my-2 rounded-lg border border-[#d91515] bg-[#fff7f7] px-3 py-2 text-[13px] text-[#16191f]"
    >
      <p className="font-semibold text-[#d91515]">{title}</p>
      <p className="mt-1">{error.message || "The VWS API returned an error."}</p>
      <p className="mt-1 font-mono text-[12px] text-[#5f6b7a]">
        {error.code} · Request ID {error.requestId ?? "—"}
      </p>
    </div>
  );
}
