"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveProjectAction } from "@/app/actions/admin";
import { ADMIN_MAP_PROJECT_ACTION, adminNav } from "@/lib/console-data";
import type { AdminProject, ApiError, Versioned } from "@/lib/vws-api/adapter";
import { projectCrumbs, projectHref } from "@/components/sites/console/admin-project-detail-view";
import { AdminAccessDenied } from "@/components/sites/console/admin-regions-view";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { useConsole } from "@/components/sites/console/console-provider";
import { CreatePage, Field, FormCard, primaryPill, secondaryPill } from "@/components/sites/console/ebs-form-parts";
import { Shell } from "@/components/sites/console/shell";
import { OrangeButton, OutlineButton } from "@/components/sites/console/ui";

/** `regions` are the registered Proxmox regions; each gets a pool input. */
type Props = { id: string; project: Versioned<AdminProject> | null; regions: string[]; loadError: ApiError | null };

const DENIED: ApiError = { code: "PermissionDenied", message: "", requestId: null };
const RELOAD = "Reload the page to see the latest saved mapping, then make your changes again.";

export function AdminProjectFormView({ id, project, regions, loadError }: Props) {
  const mayEdit = useConsole().adminActions.includes(ADMIN_MAP_PROJECT_ACTION);
  if (!mayEdit) return <AdminAccessDenied error={DENIED} page="Projects" action={ADMIN_MAP_PROJECT_ACTION} />;
  return (
    <Shell tree={adminNav} navMode="overlay-only">
      <CreatePage
        crumbs={[...projectCrumbs, { label: id, href: projectHref(id) }, { label: "Edit" }]}
        title={`Edit project ${id}`}
        info="A project uses one pool in each Proxmox region and the AWS accounts mapped to it. The VWS admin API stores the mapping."
      >
        <ApiErrorAlert error={loadError} title="The project could not be loaded" />
        {project && !loadError ? <ProjectForm id={id} project={project} regions={regions} /> : null}
      </CreatePage>
    </Shell>
  );
}

function ProjectForm({ id, project, regions }: { id: string; project: Versioned<AdminProject>; regions: string[] }) {
  const router = useRouter();
  const save = useApiAction();
  /** Read once: a later render that brings a newer version must not pair the values typed here with its ETag. */
  const [opened] = useState(project);
  const [pools, setPools] = useState<Record<string, string>>(() =>
    Object.fromEntries(opened.pools.map(({ region, pool }) => [region, pool])),
  );
  const [accounts, setAccounts] = useState(() => [...opened.awsAccounts]);
  /** A mapped region that is no longer registered keeps its input, so saving never drops it unseen. */
  const names = [...new Set([...regions, ...opened.pools.map((pool) => pool.region)])].sort();
  const saveError =
    save.error?.code === "Conflict" ? { ...save.error, message: `${save.error.message}. ${RELOAD}` } : save.error;
  /** console-api's message for `field`, shown at the input whose value it names. */
  const named = (field: string, value: string) => {
    const error = save.error;
    return error?.field === field && value !== "" && error.message.split(/\s+/).includes(value) ? error.message : null;
  };

  const submit = () => {
    const mapped = names.map((region) => ({ region, pool: (pools[region] ?? "").trim() }));
    const mapping = {
      pools: mapped.filter(({ pool }) => pool !== ""),
      awsAccounts: accounts.map((account) => account.trim()).filter((account) => account !== ""),
    };
    save.run(
      () => saveProjectAction(id, mapping, opened.etag),
      () => router.push(projectHref(id)),
    );
  };

  return (
    <>
      <FormCard title="Pools">
        <p>
          The Proxmox pool that holds this project&apos;s resources in each region. Leave a region empty to map none.
        </p>
        {names.length === 0 ? <p className="text-[#5f6b7a]">No Proxmox regions are registered.</p> : null}
        {names.map((region, index) => {
          const pool = pools[region] ?? "";
          return (
            <Field
              key={region}
              label={`Pool in ${region}`}
              htmlFor={`project-pool-${index}`}
              error={named("pools", region) ?? named("pools", pool.trim())}
            >
              <input
                id={`project-pool-${index}`}
                className="field max-w-[783px]"
                value={pool}
                onChange={(event) => setPools({ ...pools, [region]: event.target.value })}
              />
            </Field>
          );
        })}
      </FormCard>
      <FormCard title="AWS accounts">
        <p>The registered AWS accounts this project may use.</p>
        {accounts.map((account, index) => (
          <Field
            key={index}
            label="AWS account ID"
            htmlFor={`project-account-${index}`}
            error={named("awsAccounts", account.trim())}
          >
            <div className="flex max-w-[783px] flex-wrap items-center gap-3">
              <input
                id={`project-account-${index}`}
                className="field min-w-48 flex-1"
                inputMode="numeric"
                value={account}
                onChange={(event) => setAccounts(accounts.map((old, at) => (at === index ? event.target.value : old)))}
              />
              <OutlineButton
                className={secondaryPill}
                aria-label={`Remove AWS account ${index + 1}`}
                onClick={() => setAccounts(accounts.filter((_, at) => at !== index))}
              >
                Remove
              </OutlineButton>
            </div>
          </Field>
        ))}
        <OutlineButton className={secondaryPill} onClick={() => setAccounts([...accounts, ""])}>
          Add AWS account
        </OutlineButton>
      </FormCard>
      <ApiErrorAlert error={saveError} title="The project could not be saved" />
      <div className="flex items-center justify-end gap-6">
        <Link href={projectHref(id)} className="text-[14px] font-bold text-[#006ce0] hover:underline">
          Cancel
        </Link>
        <OrangeButton className={primaryPill} disabled={save.pending} onClick={submit}>
          Save changes
        </OrangeButton>
      </div>
    </>
  );
}
