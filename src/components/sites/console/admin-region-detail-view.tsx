"use client";

import { useState, type ReactNode } from "react";
import { adminNav } from "@/lib/console-data";
import { formatEc2Time } from "@/lib/ebs";
import type { AdminRegion, AdminRegionHealth, ApiError } from "@/lib/vws-api/adapter";
import { cn } from "@/lib/utils";
import { StatusText, adminCrumb, healthFields } from "@/components/sites/console/admin-regions-view";
import { useApiAction } from "@/components/sites/console/api-action";
import { RefreshIconButton } from "@/components/sites/console/ebs-form-parts";
import { ResourceDetail } from "@/components/sites/console/resource-detail";
import { CopyText, DetailGrid, dash } from "@/components/sites/console/ui";

const tabs = [
  { id: "status", label: "Status" },
  { id: "zones", label: "Availability Zones" },
];

export function AdminRegionDetailView({
  name,
  region,
  health,
  loadError,
}: {
  name: string;
  region: AdminRegion | null;
  health: AdminRegionHealth;
  loadError: ApiError | null;
}) {
  const action = useApiAction();
  const [tab, setTab] = useState("status");
  const zones = region?.zones ?? [];
  return (
    <ResourceDetail
      tree={adminNav}
      crumbs={[adminCrumb, { label: "Regions", href: "/admin/regions" }]}
      kind="region"
      id={name}
      backHref="/admin/regions"
      found={Boolean(region)}
      loadError={loadError}
      info="A Proxmox cluster registered with this console, read from the VWS admin API."
      missing={`${name} is not a registered region.`}
      items={
        region
          ? [
              ["Region name", <CopyText key="name" value={region.name} />],
              ["Type", "Proxmox"],
              ["Cluster name", dash(region.clusterName)],
              ["Proxmox API URL", dash(region.pveApiUrl)],
              ["Region endpoint", dash(region.regionEndpoint)],
              ["CA certificate", region.hasCa ? "Provided" : "—"],
              ["API token ID", dash(region.tokenId)],
              ["API token secret", region.tokenSecret],
            ]
          : []
      }
    >
      <section className="rounded-lg border border-[#d5dbdb]">
        <div className="flex gap-4 border-b border-[#e6e8eb] px-4">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "border-b-2 py-2",
                tab === item.id ? "border-[#006ce0] font-semibold text-[#006ce0]" : "border-transparent text-[#5f6b7a]",
              )}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab === "status" ? (
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold">Status</h2>
              <RefreshIconButton label="Refresh status" onClick={action.refresh} />
            </div>
            <DetailGrid
              items={[
                ...healthFields(health).map(([label, , value]): [string, ReactNode] => [label, value]),
                ["Last error time", dash(formatEc2Time(health.lastError?.time ?? ""))],
                ["Last checked", dash(formatEc2Time(health.checkedAt))],
              ]}
            />
            <h3 className="font-semibold">Nodes ({health.nodes.length})</h3>
            {health.nodes.length === 0 ? (
              <p className="text-[#5f6b7a]">No nodes reported.</p>
            ) : (
              <DetailGrid
                items={health.nodes.map((node) => [
                  node.name,
                  <StatusText key={node.name} ok={node.online} text={node.online ? "Online" : "Offline"} />,
                ])}
              />
            )}
          </div>
        ) : (
          <div className="space-y-3 p-4">
            <h2 className="text-[16px] font-semibold">Availability Zones ({zones.length})</h2>
            {zones.length === 0 ? (
              <p className="text-[#5f6b7a]">No Availability Zones registered.</p>
            ) : (
              <DetailGrid items={zones.map((zone) => [`${name}${zone.letter}`, dash(zone.nodes.join(", "))])} />
            )}
          </div>
        )}
      </section>
    </ResourceDetail>
  );
}
