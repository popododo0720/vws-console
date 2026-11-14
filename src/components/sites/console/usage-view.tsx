"use client";

import { useState, type ChangeEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar } from "lucide-react";
import { billingNav } from "@/lib/console-data";
import { WINDOW_RULE, addDays, inclusiveWindow, rangeLabel, usagePresets, type UsageWindow } from "@/lib/usage";
import type { Allocation, ApiError, ProjectUsage, UsageReport } from "@/lib/vws-api/adapter";
import { ApiErrorAlert } from "@/components/sites/console/api-action";
import { Field, FormCard, RefreshIconButton } from "@/components/sites/console/ebs-form-parts";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import {
  CopyText,
  DetailGrid,
  MenuButton,
  MenuChevron,
  OrangeButton,
  OutlineButton,
  PanelDialog,
  menuTriggerClass,
} from "@/components/sites/console/ui";

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** The table's columns after Region. The summary shows the same three as totals. */
const columns: [string, (allocation: Allocation) => string][] = [
  ["vCPUs", ({ vcpu }) => amount.format(vcpu)],
  ["Memory (GiB)", ({ memoryBytes }) => amount.format(memoryBytes / 2 ** 30)],
  ["Storage (GiB)", ({ diskBytes }) => amount.format(diskBytes / 2 ** 30)],
];

/** The Custom dialog's two days, both included, and whether Apply refused them. */
type Draft = { from: string; last: string; refused: boolean };

function DateRange({ range, today }: { range: UsageWindow | null; today: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Only from and to change, so the page's region and any other parameter stay in the URL. */
  const href = ({ from, to }: UsageWindow) => {
    const params = new URLSearchParams(search.toString());
    params.set("from", from);
    params.set("to", to);
    return `?${params}`;
  };
  const presets = usagePresets(today).map((preset) => ({
    label: preset.label,
    href: href(preset),
    checked: preset.from === range?.from && preset.to === range.to,
  }));
  const edit = (key: "from" | "last") => (event: ChangeEvent<HTMLInputElement>) =>
    setDraft((current) => current && { ...current, [key]: event.target.value, refused: false });
  const apply = () => {
    const next = draft && inclusiveWindow(draft.from, draft.last);
    if (!next) return setDraft((current) => current && { ...current, refused: true });
    setDraft(null);
    router.push(href(next));
  };
  return (
    <>
      <MenuButton
        align="right"
        className={menuTriggerClass()}
        label={
          <>
            <Calendar aria-hidden className="size-3.5" />
            <span className="sr-only">Date range</span>
            {range ? rangeLabel(range) : "Choose a date range"}
            <MenuChevron />
          </>
        }
        items={[
          ...presets,
          {
            label: "Custom",
            checked: range !== null && !presets.some((preset) => preset.checked),
            onSelect: () =>
              setDraft({ from: range?.from ?? today, last: range ? addDays(range.to, -1) : today, refused: false }),
          },
        ]}
      />
      <PanelDialog
        open={draft !== null}
        title="Custom date range"
        onClose={() => setDraft(null)}
        footer={
          <>
            <OutlineButton onClick={() => setDraft(null)}>Cancel</OutlineButton>
            <OrangeButton onClick={apply}>Apply</OrangeButton>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="From" htmlFor="usage-from">
            <input
              id="usage-from"
              type="date"
              className="field fit"
              value={draft?.from ?? ""}
              onChange={edit("from")}
            />
          </Field>
          <Field
            label="To"
            htmlFor="usage-to"
            hint="Both days are included. Days are UTC days."
            error={draft?.refused ? WINDOW_RULE : null}
          >
            <input id="usage-to" type="date" className="field fit" value={draft?.last ?? ""} onChange={edit("last")} />
          </Field>
        </div>
      </PanelDialog>
    </>
  );
}

function ProjectUsageCards({ project, range }: { project: ProjectUsage; range: UsageWindow }) {
  const read = project.regions.flatMap(({ allocation }) => (allocation ? [allocation] : []));
  const sum = (pick: (allocation: Allocation) => number) => read.reduce((total, next) => total + pick(next), 0);
  const total: Allocation | null =
    read.length === 0
      ? null
      : {
          vcpu: sum(({ vcpu }) => vcpu),
          memoryBytes: sum(({ memoryBytes }) => memoryBytes),
          diskBytes: sum(({ diskBytes }) => diskBytes),
        };
  return (
    <>
      <FormCard title="Usage summary">
        <DetailGrid
          items={[
            ...columns.map(([label, format]): [string, ReactNode] => [label, total ? format(total) : "—"]),
            ["Regions with data", `${read.length} of ${project.regions.length}`],
            ["Project ID", <CopyText key="project" value={project.project} />],
            ["Date range", rangeLabel(range)],
          ]}
        />
      </FormCard>
      <FormCard
        title={
          <>
            Usage by Region <span className="font-normal text-[#5f6b7a]">({project.regions.length})</span>
          </>
        }
      >
        <p className="-mt-3">Capacity provisioned in each Proxmox region now. It is the same for every date range.</p>
        {project.regions.length === 0 ? (
          <p className="text-[#5f6b7a]">No regions found</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Usage by Region" className="w-full max-w-2xl text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#e6e8eb] text-[#5f6b7a]">
                  {["Region", ...columns.map(([label]) => label)].map((label) => (
                    <th key={label} className="whitespace-nowrap py-1 pr-3 font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {project.regions.map(({ region, allocation }) => (
                  <tr key={region} className="border-b border-[#f2f3f3]">
                    <td className="break-all py-1 pr-3">{region}</td>
                    {columns.map(([label, format]) => (
                      <td key={label} className="py-1 pr-3">
                        {allocation ? format(allocation) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FormCard>
    </>
  );
}

export function UsageView({
  today,
  range,
  report,
  loadError,
}: {
  /** The server's UTC day, so the browser offers the ranges the server would. */
  today: string;
  /** Null for a from and to in the URL that console-api would refuse. */
  range: UsageWindow | null;
  report: UsageReport | null;
  loadError: ApiError | null;
}) {
  const router = useRouter();
  const unread = report?.projects.flatMap((project) => project.regions).filter((region) => !region.allocation) ?? [];
  const missing: ApiError | null =
    unread.length === 0
      ? null
      : {
          code: unread[0].error || "MalformedResponse",
          message: `No data for ${unread.map(({ region }) => region).join(", ")}.`,
          requestId: null,
        };
  return (
    <Shell tree={billingNav}>
      <PageHeader
        crumbs={[{ label: billingNav.title }, { label: "Home" }]}
        title="Billing and Cost Management home"
        info="Usage is the capacity provisioned for your project in each Proxmox region, read from the VWS API."
        actions={
          <>
            <DateRange range={range} today={today} />
            <RefreshIconButton label="Refresh usage" onClick={() => router.refresh()} />
          </>
        }
      />
      <ApiErrorAlert error={loadError} title="Usage could not be loaded" />
      <ApiErrorAlert error={missing} title="Usage could not be read in every region" />
      {report ? (
        <div className="min-h-0 flex-1 space-y-5 overflow-auto px-4 pb-6 pt-2">
          {report.projects.length === 0 ? <p className="text-[13px] text-[#5f6b7a]">No usage to display</p> : null}
          {report.projects.map((project) => (
            <ProjectUsageCards key={project.project} project={project} range={report} />
          ))}
        </div>
      ) : null}
    </Shell>
  );
}
