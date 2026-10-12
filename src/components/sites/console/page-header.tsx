import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { InfoTip } from "@/components/sites/console/ui";

export function PageHeader({
  crumbs,
  info,
  actions,
  meta,
}: {
  mark?: string;
  crumbs: { label: string; href?: string }[];
  info?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 pb-2 pt-3">
      <div className="flex min-w-0 flex-wrap items-center gap-1 pt-1">
        {crumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight className="size-4 text-[#5f6b7a]" /> : null}
            {crumb.href ? (
              <Link href={crumb.href} className="text-[20px] font-bold leading-7 text-[#006ce0] hover:underline">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-[20px] font-bold leading-7">{crumb.label}</span>
            )}
          </span>
        ))}
        {info ? <InfoTip text={info} /> : null}
      </div>
      <div className="ml-auto flex flex-col items-end gap-1">
        {meta ? <div className="text-[12px] text-[#5f6b7a]">{meta}</div> : null}
        {actions ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
