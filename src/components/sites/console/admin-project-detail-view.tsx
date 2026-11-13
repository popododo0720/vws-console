"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ADMIN_MAP_PROJECT_ACTION, adminNav } from "@/lib/console-data";
import type { AdminProject, ApiError, Versioned } from "@/lib/vws-api/adapter";
import { cn } from "@/lib/utils";
import { adminCrumb, regionHref } from "@/components/sites/console/admin-regions-view";
import { useApiAction } from "@/components/sites/console/api-action";
import { useConsole } from "@/components/sites/console/console-provider";
import { RefreshIconButton, secondaryPill } from "@/components/sites/console/ebs-form-parts";
import { DetailLink, ResourceDetail } from "@/components/sites/console/resource-detail";
import { CopyText } from "@/components/sites/console/ui";

export const projectHref = (project: string) => `/admin/projects/${encodeURIComponent(project)}`;
/** "Projects" has no link: console-api cannot list projects yet, so there is no list page to go to. */
export const projectCrumbs = [adminCrumb, { label: "Projects" }];

const tabs = ["Pools", "AWS accounts"];

export function AdminProjectDetailView({
  id,
  project,
  loadError,
}: {
  id: string;
  project: Versioned<AdminProject> | null;
  loadError: ApiError | null;
}) {
  const action = useApiAction();
  const [tab, setTab] = useState(tabs[0]);
  const mayEdit = useConsole().adminActions.includes(ADMIN_MAP_PROJECT_ACTION);
  const pools: ReactNode[][] = (project?.pools ?? []).map(({ region, pool }) => [
    <DetailLink key="region" href={regionHref(region)} id={region} />,
    pool,
  ]);
  const accounts: ReactNode[][] = (project?.awsAccounts ?? []).map((account) => [account]);
  const panel =
    tab === tabs[0]
      ? { columns: ["Region", "Pool"], rows: pools, empty: "No pools mapped." }
      : { columns: ["AWS account ID"], rows: accounts, empty: "No AWS accounts mapped." };
  return (
    <ResourceDetail
      tree={adminNav}
      crumbs={projectCrumbs}
      kind="project"
      id={id}
      backHref="/admin/regions"
      found={Boolean(project)}
      loadError={loadError}
      info="A project's pool in each Proxmox region and its AWS accounts. With no saved mapping, each pool is named after the project ID."
      missing={`${id} has no project mapping.`}
      actions={
        project && mayEdit ? (
          <Link href={`${projectHref(id)}/edit`} className={`${secondaryPill} inline-flex items-center`}>
            Edit
          </Link>
        ) : undefined
      }
      items={
        project
          ? [
              ["Project ID", <CopyText key="id" value={project.project} />],
              ["Mapping", project.version === 0 ? "Default pools, not saved" : "Saved"],
              ["Version", String(project.version)],
            ]
          : []
      }
    >
      <section className="rounded-lg border border-[#d5dbdb]">
        <div className="flex gap-4 border-b border-[#e6e8eb] px-4">
          {tabs.map((title) => (
            <button
              key={title}
              type="button"
              className={cn(
                "border-b-2 py-2",
                tab === title ? "border-[#006ce0] font-semibold text-[#006ce0]" : "border-transparent text-[#5f6b7a]",
              )}
              onClick={() => setTab(title)}
            >
              {title}
            </button>
          ))}
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-semibold">
              {tab} ({panel.rows.length})
            </h2>
            <RefreshIconButton label="Refresh mapping" onClick={action.refresh} />
          </div>
          {panel.rows.length === 0 ? (
            <p className="text-[#5f6b7a]">{panel.empty}</p>
          ) : (
            <table aria-label={tab} className="w-full max-w-2xl text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#e6e8eb] text-[#5f6b7a]">
                  {panel.columns.map((column) => (
                    <th key={column} className="py-1 pr-3 font-semibold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {panel.rows.map((cells, row) => (
                  <tr key={row} className="border-b border-[#f2f3f3]">
                    {cells.map((cell, column) => (
                      <td key={column} className="break-all py-1 pr-3">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </ResourceDetail>
  );
}
