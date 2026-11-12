"use client";

import { useRef, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { BreadcrumbBar } from "@/components/sites/console/page-header";
import { InfoTip } from "@/components/sites/console/ui";

export function CreatePage({
  crumbs,
  title,
  info,
  lead,
  children,
}: {
  crumbs: { label: string; href?: string }[];
  title: string;
  info: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <>
      <BreadcrumbBar crumbs={crumbs} />
      <div className="min-h-0 flex-1 overflow-auto bg-[#fafafa]">
        <div className="mx-auto max-w-[1620px] px-6 pb-10 pt-5 lg:px-10">
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-bold leading-8">{title}</h1>
            <InfoTip text={info} />
          </div>
          {lead ? <p className="mt-0.5 text-[14px] text-[#16191f]">{lead}</p> : null}
          <div className="mt-4 space-y-5">{children}</div>
        </div>
      </div>
    </>
  );
}

export function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-[#d91515] bg-[#fff7f7] px-3 py-2 text-[14px]">
      <p className="font-semibold text-[#d91515]">{title}</p>
      {children}
    </div>
  );
}

export function FormCard({ title, info, children }: { title: ReactNode; info?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#c6c6cd] bg-white px-5 pb-5 pt-4 text-[14px]">
      <h2 className="flex items-center gap-2 text-[20px] font-bold leading-7">
        {title}
        {info ? <InfoTip text={info} /> : null}
      </h2>
      <div className="mt-3 space-y-5">{children}</div>
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  info,
  description,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  info?: string;
  description?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <label htmlFor={htmlFor} className="text-[14px] font-bold">
          {label}
        </label>
        {info ? (
          <>
            <span aria-hidden className="h-3.5 w-px bg-[#c6c6cd]" />
            <InfoTip text={info} />
          </>
        ) : null}
      </div>
      {description ? <p className="text-[12px] text-[#5f6b7a]">{description}</p> : null}
      <div className="mt-1">{children}</div>
      {error ? (
        <p role="alert" className="mt-1 text-[12px] text-[#d91515]">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[12px] text-[#5f6b7a]">{hint}</p>
      ) : null}
    </div>
  );
}

export const optional = (label: string) => (
  <>
    {label} - <i>optional</i>
  </>
);

export function RefreshIconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-[#006ce0] text-[#006ce0] hover:bg-[#f2f8fd]"
      onClick={onClick}
    >
      <RefreshCw className="size-3.5" />
    </button>
  );
}

/** console-api stores no tags on volumes or snapshots, so the section shows its empty state with Add disabled. */
export function TagsCard({ title }: { title: ReactNode }) {
  return (
    <FormCard title={title} info="console-api does not store tags on volumes or snapshots yet.">
      <div className="-mt-3 space-y-4">
        <p>
          A tag is a label that you assign to a VWS resource. Each tag consists of a key and an optional value. You can
          use tags to search and filter your resources or track your VWS costs.
        </p>
        <p className="text-[#5f6b7a]">No tags associated with the resource.</p>
        <div>
          <button
            type="button"
            disabled
            title="console-api does not store tags on volumes or snapshots yet."
            className="inline-flex h-8 items-center rounded-full border-2 border-[#9ba7b6] px-5 text-[14px] font-bold text-[#9ba7b6]"
          >
            Add new tag
          </button>
          <p className="mt-1 text-[12px] text-[#5f6b7a]">You can add up to 50 tags.</p>
        </div>
      </div>
    </FormCard>
  );
}

type PendingCreate = { body: string; key: string };

function readPending(name: string): PendingCreate | null {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(name) ?? "null");
    if (typeof value !== "object" || value === null) return null;
    const { body, key } = value as Record<string, unknown>;
    return typeof body === "string" && typeof key === "string" ? { body, key } : null;
  } catch {
    return null;
  }
}

/**
 * One idempotency key per request body, kept in sessionStorage under `name`: resending the same body (double click,
 * retry after a timeout, or a reload after the response was lost) reuses the key so console-api returns the first
 * result. A changed body gets a fresh key, and `settle` forgets it after a success so the next create is new.
 */
export function useIdempotencyKey(name: string) {
  const fallback = useRef<PendingCreate | null>(null);
  const keyFor = (body: unknown) => {
    const text = JSON.stringify(body);
    const pending = readPending(name) ?? fallback.current;
    if (pending?.body === text) return pending.key;
    const next = { body: text, key: crypto.randomUUID() };
    fallback.current = next;
    try {
      window.sessionStorage.setItem(name, JSON.stringify(next));
    } catch {}
    return next.key;
  };
  const settle = () => {
    fallback.current = null;
    try {
      window.sessionStorage.removeItem(name);
    } catch {}
  };
  return { keyFor, settle };
}

/** The EBS screens' buttons are pills: primary orange, secondary outlined in blue. */
export const primaryPill = "h-8 rounded-full px-5 text-[14px] font-bold";
export const secondaryPill =
  "h-8 rounded-full border-2 border-[#006ce0] bg-white px-4 text-[14px] font-bold text-[#006ce0] hover:bg-[#f2f8fd] hover:text-[#006ce0]";
