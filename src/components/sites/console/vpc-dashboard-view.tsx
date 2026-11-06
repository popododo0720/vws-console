"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, RefreshCw } from "lucide-react";
import { networkNav } from "@/lib/console-data";
import { DASHBOARD_CARDS, type DashboardCard, type DashboardInput } from "@/lib/vpc-dashboard";
import type { ApiError } from "@/lib/vws-api/adapter";
import { ApiErrorAlert } from "@/components/sites/console/api-action";
import { useConsole } from "@/components/sites/console/console-provider";
import { primaryPill, secondaryPill } from "@/components/sites/console/ebs-form-parts";
import { BreadcrumbBar } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { orangeLinkClass } from "@/components/sites/console/ui";
import { VpcFilter, useVpcFilter } from "@/components/sites/console/vpc-filter";

export type DashboardLoadError = { label: string; error: ApiError };

const linkClass = "text-[#006ce0] underline";

/** A link-styled entry that VWS has no page for. */
function NoTarget({ children, external = false }: { children: ReactNode; external?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 ${linkClass}`}>
      {children}
      {external ? <ExternalLink aria-hidden className="size-3" /> : null}
    </span>
  );
}

function Panel({ title, external = false, children }: { title: string; external?: boolean; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[#d5dbdb] bg-white px-5 py-4 shadow-[0_1px_1px_rgba(0,28,36,0.1)]">
      <h2 className="flex items-center gap-2 text-[20px] font-bold leading-7">
        {title}
        {external ? <ExternalLink aria-hidden className="size-3.5" /> : null}
      </h2>
      <div className="mt-2 text-[13px]">{children}</div>
    </section>
  );
}

function PanelLinks({ items }: { items: { label: string; external?: boolean }[] }) {
  return (
    <ul className="divide-y divide-[#e6e8eb]">
      {items.map((item) => (
        <li key={item.label} className="py-2 first:pt-0 last:pb-0">
          <NoTarget external={item.external}>{item.label}</NoTarget>
        </li>
      ))}
    </ul>
  );
}

/** Only the current region's count links: the list screens show the current region, not the one counted. */
function Count({ card, value, current }: { card: DashboardCard; value: number | null; current: boolean }) {
  if (value === null) return <span title="This count could not be loaded.">—</span>;
  if (!current) return <span>{value}</span>;
  return card.href ? (
    <Link href={card.href} className={linkClass}>
      {value}
    </Link>
  ) : (
    <span className={linkClass}>{value}</span>
  );
}

function ResourceCard({
  card,
  input,
  region,
  regions,
  vpcId,
}: {
  card: DashboardCard;
  input: DashboardInput;
  region: string;
  regions: readonly string[];
  vpcId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section aria-label={card.label} className="rounded-2xl border border-[#c6c6cd] bg-white px-3 py-3 text-[13px]">
      <div className="flex items-start justify-between gap-3">
        {card.href ? (
          <Link href={card.href} className="font-bold text-[#006ce0] underline">
            {card.label}
          </Link>
        ) : (
          <span className="font-bold text-[#006ce0] underline">{card.label}</span>
        )}
        <span>
          {region} <Count card={card} value={card.count(input, region, vpcId)} current />
        </span>
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        className="mt-1 flex items-center gap-2 text-[16px] font-bold"
        onClick={() => setExpanded((value) => !value)}
      >
        <span aria-hidden className="text-[11px]">
          {expanded ? "▼" : "▶"}
        </span>
        See all regions
      </button>
      {expanded ? (
        <ul className="mt-2 space-y-1 pl-5">
          {regions.map((name) => (
            <li key={name} className="flex justify-between gap-3">
              <span>{name}</span>
              <Count card={card} value={card.count(input, name, vpcId)} current={name === region} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function VpcDashboardView({
  vpcs,
  subnets,
  securityGroups,
  addresses,
  loadErrors,
}: Pick<DashboardInput, "vpcs" | "subnets" | "securityGroups" | "addresses"> & { loadErrors: DashboardLoadError[] }) {
  const api = useConsole();
  const router = useRouter();
  const [vpcFilter, setVpcFilter] = useVpcFilter(vpcs ?? []);
  const input: DashboardInput = {
    vpcs,
    subnets,
    securityGroups,
    addresses,
    routeTables: api.dataset.routeTables,
    internetGateways: api.dataset.internetGateways,
    natGateways: api.dataset.natGateways,
  };

  return (
    <Shell tree={networkNav} navHeader={<VpcFilter vpcs={vpcs ?? []} value={vpcFilter} onChange={setVpcFilter} />}>
      <BreadcrumbBar crumbs={[]} />
      {loadErrors.map((item) => (
        <ApiErrorAlert key={item.label} error={item.error} title={`${item.label} could not be loaded`} />
      ))}
      <div className="grid min-h-0 flex-1 gap-5 overflow-auto px-4 py-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/network/vpcs?create=1" className={`${orangeLinkClass} ${primaryPill}`}>
              Create VPC
            </Link>
            <Link href="/compute/launch" className={`${secondaryPill} inline-flex items-center`}>
              Launch EC2 Instances
            </Link>
          </div>
          <p className="mt-1 text-[11px] text-[#5f6b7a]">
            Note: Your Instances will launch in the {api.region} region.
          </p>
          <div className="mt-6 flex items-end justify-between gap-3 border-b border-[#d5dbdb] pb-1">
            <div>
              <h2 className="text-[20px] font-bold leading-7">Resources by Region</h2>
              <p className="text-[13px]">You are using the following VWS VPC resources</p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 pb-1 text-[13px] font-bold text-[#006ce0]"
              onClick={() => router.refresh()}
            >
              <RefreshCw className="size-4" />
              Refresh Resources
            </button>
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {DASHBOARD_CARDS.map((card) => (
              <ResourceCard
                key={card.key}
                card={card}
                input={input}
                region={api.region}
                regions={api.regions}
                vpcId={vpcFilter === "all" ? null : vpcFilter}
              />
            ))}
          </div>
        </div>
        <aside className="space-y-5">
          <Panel title="Service Health">
            <NoTarget external>View complete service health details</NoTarget>
          </Panel>
          <Panel title="Settings">
            <PanelLinks
              items={[
                { label: "Account-level encryption control" },
                { label: "Block Public Access" },
                { label: "Zones", external: true },
                { label: "Console Experiments" },
              ]}
            />
          </Panel>
          <Panel title="Additional Information" external>
            <PanelLinks
              items={[
                { label: "VPC Documentation" },
                { label: "All VPC Resources" },
                { label: "Forums" },
                { label: "Report an Issue" },
              ]}
            />
          </Panel>
          <Panel title="VWS Network Manager">
            <p className="leading-5">
              VWS Network Manager provides tools and features to help you manage and monitor your network on VWS.
              Network Manager makes it easier to perform connectivity management, network monitoring and
              troubleshooting, IP management, and network security and governance.
            </p>
            <p className="mt-4">
              <NoTarget external>Get started with Network Manager</NoTarget>
            </p>
          </Panel>
        </aside>
      </div>
    </Shell>
  );
}
