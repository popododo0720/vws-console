"use client";

import { useRef, useState, useTransition, type ChangeEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveRegionAction, testRegionAction } from "@/app/actions/admin";
import { adminNav } from "@/lib/console-data";
import type { AdminRegion, ApiError, ApiResult, ConnectionStep, Versioned } from "@/lib/vws-api/adapter";
import { StatusText, adminCrumb, regionHref } from "@/components/sites/console/admin-regions-view";
import { ApiErrorAlert, UNREACHABLE, useApiAction } from "@/components/sites/console/api-action";
import {
  CreatePage,
  Field,
  FormCard,
  optional,
  primaryPill,
  secondaryPill,
} from "@/components/sites/console/ebs-form-parts";
import { Shell } from "@/components/sites/console/shell";
import { OrangeButton, OutlineButton } from "@/components/sites/console/ui";

const TEXT_KEYS = ["name", "clusterName", "pveApiUrl", "regionEndpoint", "caPem", "tokenId"] as const;
type Props = { name?: string; region: Versioned<AdminRegion> | null; loadError: ApiError | null };
const STEP_OK: Record<string, boolean> = { PASS: true, FAIL: false };
const inputClass = "field max-w-[783px]";
const nameHint = "pve-, a location and a number, such as pve-seoul-1. It cannot be changed later.";
const pemClass = "w-full max-w-[783px] rounded-lg border border-[#aab7b8] px-2.5 py-2 font-mono text-[13px]";

/** The save state lives here, outside the keyed form, so the conflict alert survives the reload that remounts it. */
export function AdminRegionFormView({ name, region, loadError }: Props) {
  const save = useApiAction();
  const title = name ? `Edit ${name}` : "Register region";
  const here = name ? [{ label: name, href: regionHref(name) }, { label: "Edit" }] : [{ label: title }];
  return (
    <Shell tree={adminNav} navMode="overlay-only">
      <CreatePage
        crumbs={[adminCrumb, { label: "Regions", href: "/admin/regions" }, ...here]}
        title={title}
        info="A region is one Proxmox cluster. The VWS admin API stores its registration."
        lead={name ? undefined : "Register a Proxmox cluster so that this console can manage it as a region."}
      >
        <ApiErrorAlert error={loadError} title="The region could not be loaded" />
        {loadError ? null : <RegionForm key={region?.etag} region={region} save={save} />}
      </CreatePage>
    </Shell>
  );
}

/** Keyed by the ETag: a reload that brings a newer version starts the form again from the saved values. */
function RegionForm({ region, save }: Pick<Props, "region"> & { save: ReturnType<typeof useApiAction> }) {
  const router = useRouter();
  /** Uncontrolled, so the typed secret is never in React state or in an attribute of the page. */
  const secret = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(() => Object.fromEntries(TEXT_KEYS.map((key) => [key, region?.[key] ?? ""])));
  const [zones, setZones] = useState(() => (region?.zones ?? []).map((z) => ({ ...z, nodes: z.nodes.join(", ") })));
  const [probe, setProbe] = useState<ApiResult<ConnectionStep[]> | null>(null);
  const [testing, startTest] = useTransition();
  const back = region ? regionHref(region.name) : "/admin/regions";
  const changed = `${region?.name} was changed since you opened it. The form now shows the latest saved values. Review them and save again.`;
  const saveError = region && save.error?.code === "Conflict" ? { ...save.error, message: changed } : save.error;
  const fieldError = (key: string) =>
    [save.error, probe?.ok === false ? probe.error : null].find((error) => error?.field === key)?.message ?? null;
  const typedSecret = () => secret.current?.value ?? "";

  const submit = () =>
    save.run(
      async () => {
        const failure = await saveRegionAction({ ...draft, zones }, typedSecret(), region?.etag ?? null);
        if (failure?.code === "Conflict" && region) save.refresh();
        return failure;
      },
      () => {
        if (secret.current) secret.current.value = "";
        router.push(regionHref(draft.name.trim()));
      },
    );
  const test = () =>
    startTest(async () => {
      const unreachable = { ok: false as const, error: UNREACHABLE };
      setProbe(await testRegionAction({ ...draft, zones }, typedSecret(), Boolean(region)).catch(() => unreachable));
    });

  const text = (key: (typeof TEXT_KEYS)[number], label: ReactNode, hint: string) => {
    const props = {
      id: `region-${key}`,
      className: key === "caPem" ? pemClass : inputClass,
      value: draft[key],
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft({ ...draft, [key]: event.target.value }),
    };
    return (
      <Field label={label} htmlFor={props.id} hint={hint} error={fieldError(key)}>
        {key === "caPem" ? <textarea {...props} rows={5} /> : <input {...props} />}
      </Field>
    );
  };
  const zoneInput = (index: number, key: "letter" | "nodes", label: string) => (
    <Field label={label} htmlFor={`region-zone-${index}-${key}`}>
      <input
        id={`region-zone-${index}-${key}`}
        className="field"
        value={zones[index][key]}
        onChange={(event) => setZones(zones.map((z, at) => (at === index ? { ...z, [key]: event.target.value } : z)))}
      />
    </Field>
  );

  return (
    <>
      <FormCard title="Region settings">
        {region ? null : text("name", "Region name", nameHint)}
        {text("clusterName", "Cluster name", "The name of the Proxmox cluster, as pvecm status reports it.")}
        {text("pveApiUrl", "Proxmox API URL", "An HTTPS origin, such as https://pve1.example.com:8006.")}
        {text("regionEndpoint", "Region endpoint", "The region daemon's HTTPS origin, such as https://10.0.0.10:8443.")}
        {text("caPem", optional("CA certificate"), "The PEM certificates that sign the Proxmox API certificate.")}
      </FormCard>
      <FormCard title="API token">
        {text("tokenId", "API token ID", "user@realm!token, such as vws@pve!console.")}
        <Field
          label="API token secret"
          htmlFor="region-secret"
          description={region ? `Stored secret: ${region.tokenSecret}` : undefined}
          hint={`Enter a secret to ${region ? "replace the stored one" : "store it"}. It cannot be shown again after you save.`}
          error={fieldError("tokenSecret")}
        >
          <input id="region-secret" ref={secret} type="password" autoComplete="new-password" className={inputClass} />
        </Field>
      </FormCard>
      <FormCard title={optional("Availability Zones")}>
        <p>An Availability Zone is a group of cluster nodes. Its name is the region name followed by its letter.</p>
        {zones.map((_, index) => (
          <div key={index} className="flex max-w-[783px] flex-wrap items-end gap-3">
            <div className="w-[96px]">{zoneInput(index, "letter", "Zone letter")}</div>
            <div className="min-w-48 flex-1">{zoneInput(index, "nodes", "Nodes, separated by commas")}</div>
            <OutlineButton className={secondaryPill} onClick={() => setZones(zones.filter((_, at) => at !== index))}>
              Remove
            </OutlineButton>
          </div>
        ))}
        <OutlineButton className={secondaryPill} onClick={() => setZones([...zones, { letter: "", nodes: "" }])}>
          Add Availability Zone
        </OutlineButton>
      </FormCard>
      <FormCard title="Test connection">
        {region ? <p>Tests the saved registration, with a secret entered above. Save other changes first.</p> : null}
        <div className="flex items-center gap-3">
          <OutlineButton className={secondaryPill} disabled={testing} onClick={test}>
            Test connection
          </OutlineButton>
          {testing ? <span role="status">Testing the connection…</span> : null}
        </div>
        {probe?.ok === false ? <ApiErrorAlert error={probe.error} title="The connection could not be tested" /> : null}
        {probe?.ok ? (
          <table aria-label="Connection test steps" className="w-full max-w-[783px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#e6e8eb] text-[#5f6b7a]">
                <th className="py-1 pr-3 font-semibold">Step</th>
                <th className="py-1 pr-3 font-semibold">Result</th>
                <th className="py-1 font-semibold">Message</th>
              </tr>
            </thead>
            <tbody>
              {probe.value.map((step) => (
                <tr key={step.name} className="border-b border-[#f2f3f3]">
                  <td className="py-1 pr-3">{step.name}</td>
                  <td className="py-1 pr-3">
                    <StatusText ok={STEP_OK[step.result] ?? null} text={step.result} />
                  </td>
                  <td className="py-1">{step.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </FormCard>
      <ApiErrorAlert error={saveError} title={`The region could not be ${region ? "saved" : "registered"}`} />
      <div className="flex items-center justify-end gap-6">
        <Link href={back} className="text-[14px] font-bold text-[#006ce0] hover:underline">
          Cancel
        </Link>
        <OrangeButton className={primaryPill} disabled={save.pending} onClick={submit}>
          {region ? "Save changes" : "Register region"}
        </OrangeButton>
      </div>
    </>
  );
}
