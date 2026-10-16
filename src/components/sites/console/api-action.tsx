"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApiError } from "@/lib/vws-api/adapter";

export function useApiAction() {
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ApiError | null>, onDone?: () => void) =>
    startTransition(async () => {
      const failure = await action();
      setError(failure);
      if (!failure) {
        onDone?.();
        router.refresh();
      }
    });
  const clear = () => setError(null);
  return { error, pending, run, clear, refresh: () => router.refresh() };
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
