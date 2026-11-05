import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Menu } from "lucide-react";
import { InfoTip } from "@/components/sites/console/ui";

export const TOGGLE_NAV_EVENT = "console:toggle-nav";

export function BreadcrumbBar({ crumbs }: { crumbs: { label: string; href?: string }[] }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[#e6e8eb] px-4 text-[12px]">
      <button
        type="button"
        aria-label="Toggle navigation"
        className="grid size-6 place-items-center rounded text-[#16191f] hover:bg-[#f4f5f6]"
        onClick={() => window.dispatchEvent(new Event(TOGGLE_NAV_EVENT))}
      >
        <Menu className="size-4" />
      </button>
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
        {crumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? <ChevronRight className="size-3 text-[#5f6b7a]" /> : null}
            {crumb.href ? (
              <Link href={crumb.href} className="text-[#006ce0] hover:underline">
                {crumb.label}
              </Link>
            ) : (
              <span className="font-semibold">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({
  crumbs,
  title: heading,
  lead,
  info,
  count,
  actions,
}: {
  mark?: string;
  crumbs: { label: string; href?: string }[];
  title?: string;
  lead?: ReactNode;
  info?: string;
  /** Shown in grey after the title, as "(3)". */
  count?: number;
  actions?: ReactNode;
}) {
  const title = heading ?? crumbs[crumbs.length - 1]?.label ?? "";
  return (
    <>
      <BreadcrumbBar crumbs={crumbs} />
      {lead}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-2 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-[20px] font-bold leading-7">
            {title}
            {count === undefined ? null : <span className="font-normal text-[#5f6b7a]"> ({count})</span>}
          </h1>
          {info ? <InfoTip text={info} /> : null}
        </div>
        {actions ? <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      </div>
    </>
  );
}
