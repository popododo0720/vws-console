"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  STEP_IDS,
  STORAGE_CHOICES,
  reachableSteps,
  summaryReady,
  type FieldError,
  type PreflightReport,
  type ProgressEvent,
  type StepId,
  type StorageDriver,
  type StorageSpec,
} from "@/lib/installer/contract";
import {
  InstallerApiError,
  MOCK_NICS,
  MOCK_NODES,
  MOCK_STORAGE_CLASSES,
  PROFILES,
  createMockInstaller,
  type MockInstaller,
  type StepValues,
} from "@/lib/installer/mock-client";
import { FieldLabel, Mark, OrangeButton, OutlineButton, SampleBadge, dash } from "@/components/sites/console/ui";

const STEP_LABELS: Record<StepId, string> = {
  roles: "Roles",
  network: "Network",
  storage: "Storage",
  eip: "Elastic IPs",
  profile: "Profile",
  observability: "Observability",
};

export const ISCSI_NOTICE =
  "iSCSI is supported only through generic CSI, when a vendor CSI driver that can provision volumes exists.";

type Screen = { kind: "step"; step: StepId } | { kind: "summary" } | { kind: "progress" } | { kind: "done" };

const inputClass = "mt-1 block h-8 w-full max-w-md rounded-lg border border-[#8c8c94] px-2 text-[13px]";

function Errors({ errors, field }: { errors: FieldError[]; field: string }) {
  const hit = errors.filter((e) => e.field === field);
  return hit.map((e) => (
    <p key={e.code} role="alert" className="mt-1 text-[12px] text-[#d91515]">
      {e.message}
    </p>
  ));
}

function Preflight({ report }: { report: PreflightReport | null }) {
  if (!report || report.checks.length === 0) return null;
  return (
    <section aria-label="Preflight" className="rounded-lg border border-[#e6e8eb] p-3 text-[13px]">
      <h3 className="mb-2 font-semibold">Preflight</h3>
      <ul className="space-y-1">
        {report.checks.map((c) => (
          <li key={c.id}>
            <span className="font-mono">{c.id}</span>: {c.status} ({c.severity}) — {c.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StorageForm({
  value,
  onChange,
  errors,
}: {
  value: StorageSpec;
  onChange: (v: StorageSpec) => void;
  errors: FieldError[];
}) {
  const pick = (driver: StorageDriver) => {
    if (driver === "nfs") onChange({ driver, nfs: { server: "", share: "" } });
    else if (driver === "existing") onChange({ driver, storageClass: "", volumeMode: "Block" });
    else if (driver === "rook-ceph") onChange({ driver });
  };
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-1 font-semibold">Storage driver</legend>
        {STORAGE_CHOICES.map((c) => (
          <label
            key={c.driver}
            className={c.enabled ? "flex items-center gap-2" : "flex items-center gap-2 text-[#8c8c94]"}
          >
            <input
              type="radio"
              name="driver"
              checked={value.driver === c.driver}
              disabled={!c.enabled}
              onChange={() => pick(c.driver)}
            />
            {c.label}
            {!c.enabled && <span className="rounded-full bg-[#f4f4f4] px-2 text-[11px]">Coming soon</span>}
          </label>
        ))}
      </fieldset>
      <p role="note" className="rounded-lg bg-[#f2f8fd] p-3 text-[13px]">
        {ISCSI_NOTICE}
      </p>
      {value.driver === "nfs" && (
        <div className="space-y-3">
          <div>
            <FieldLabel>
              NFS server
              <input
                className={inputClass}
                placeholder="Host name or IP address"
                value={value.nfs.server}
                onChange={(e) => onChange({ ...value, nfs: { ...value.nfs, server: e.target.value } })}
              />
            </FieldLabel>
            <Errors errors={errors} field="spec.storage.nfs.server" />
          </div>
          <div>
            <FieldLabel>
              Export path
              <input
                className={inputClass}
                placeholder="/exports/vws"
                value={value.nfs.share}
                onChange={(e) => onChange({ ...value, nfs: { ...value.nfs, share: e.target.value } })}
              />
            </FieldLabel>
            <Errors errors={errors} field="spec.storage.nfs.share" />
          </div>
          <p className="text-[12px] text-[#5f6b7a]">NFS volumes run in Filesystem mode and have no snapshots.</p>
        </div>
      )}
      {value.driver === "existing" && (
        <div className="space-y-3">
          <div>
            <FieldLabel>
              StorageClass
              <select
                className={inputClass}
                value={value.storageClass}
                onChange={(e) => onChange({ ...value, storageClass: e.target.value })}
              >
                <option value="">Choose a StorageClass</option>
                {MOCK_STORAGE_CLASSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </FieldLabel>
            <Errors errors={errors} field="spec.storage.storageClass" />
          </div>
          <FieldLabel>
            Volume mode
            <select
              className={inputClass}
              value={value.volumeMode ?? "Block"}
              onChange={(e) => onChange({ ...value, volumeMode: e.target.value as "Block" | "Filesystem" })}
            >
              <option>Block</option>
              <option>Filesystem</option>
            </select>
          </FieldLabel>
          <p className="text-[12px] text-[#5f6b7a]">
            The CSI driver must already be installed. VWS does not install or run it.
          </p>
        </div>
      )}
    </div>
  );
}

function StepForm<S extends StepId>({
  step,
  value,
  onChange,
  errors,
}: {
  step: S;
  value: StepValues[S];
  onChange: (v: StepValues[S]) => void;
  errors: FieldError[];
}): ReactNode {
  const set = onChange as (v: StepValues[StepId]) => void;
  switch (step) {
    case "roles":
      return (
        <table className="text-[13px]">
          <thead>
            <tr>
              <th className="pr-6 text-left">Node</th>
              <th className="text-left">Roles (node labels)</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_NODES.map((n) => (
              <tr key={n.name}>
                <td className="pr-6">{n.name}</td>
                <td>{n.roles.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "network": {
      const v = value as StepValues["network"];
      return (["tunnel", "external"] as const).map((k) => (
        <div key={k} className="mb-3">
          <FieldLabel>
            {k === "tunnel" ? "Tunnel NIC" : "External NIC"}
            <select
              className={inputClass}
              value={v.nodes[k].nic}
              onChange={(e) => set({ nodes: { ...v.nodes, [k]: { nic: e.target.value } } })}
            >
              <option value="">Choose a NIC</option>
              {MOCK_NICS.map((n) => (
                <option key={n.name} value={n.name}>{`${n.name} (MTU ${n.mtu})`}</option>
              ))}
            </select>
          </FieldLabel>
          <Errors errors={errors} field={`spec.network.nodes.${k}.nic`} />
        </div>
      ));
    }
    case "storage":
      return <StorageForm value={value as StorageSpec} onChange={set} errors={errors} />;
    case "eip": {
      const v = value as StepValues["eip"];
      return (
        <div>
          <FieldLabel>
            EIP pool (CIDR)
            <input className={inputClass} value={v.eipPool} onChange={(e) => set({ eipPool: e.target.value })} />
          </FieldLabel>
          <Errors errors={errors} field="spec.network.nodes.external.eipPool" />
        </div>
      );
    }
    case "profile": {
      const v = value as StepValues["profile"];
      return (
        <FieldLabel>
          Profile
          <select
            className={inputClass}
            value={v.profile}
            onChange={(e) => set({ profile: e.target.value as StepValues["profile"]["profile"] })}
          >
            {PROFILES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </FieldLabel>
      );
    }
    case "observability": {
      const v = value as StepValues["observability"];
      return (
        <div>
          <FieldLabel>
            OTLP endpoint (empty turns exporting off)
            <input
              className={inputClass}
              value={v.otlpEndpoint}
              onChange={(e) => set({ otlpEndpoint: e.target.value })}
            />
          </FieldLabel>
          <Errors errors={errors} field="spec.observability.otlpEndpoint" />
        </div>
      );
    }
  }
}

export function InstallerWizard({ api: given }: { api?: MockInstaller }) {
  const api = useMemo(() => given ?? createMockInstaller(), [given]);
  const [snapshot, setSnapshot] = useState(() => api.state());
  const [screen, setScreen] = useState<Screen>({ kind: "step", step: "roles" });
  const [draft, setDraft] = useState<StepValues>(snapshot.values);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [preflight, setPreflight] = useState<PreflightReport | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReturnType<MockInstaller["summary"]> | null>(null);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  // Held in component state only; never written to localStorage or sessionStorage.
  const [credential, setCredential] = useState<string | null>(null);

  const reachable = reachableSteps(snapshot.status);
  const call = <T,>(fn: () => T): T | undefined => {
    setApiError(null);
    try {
      return fn();
    } catch (e) {
      if (e instanceof InstallerApiError) setApiError(e.body.error.code);
      else throw e;
    }
  };

  const go = (next: Screen) => {
    if (next.kind === "summary") {
      const s = call(() => api.summary());
      if (!s) return;
      setSummary(s);
    }
    setErrors([]);
    setPreflight(null);
    setScreen(next);
  };

  const save = (step: StepId) => {
    const res = call(() => api.putStep(step, draft[step]));
    setSnapshot(api.state());
    if (!res) return;
    setErrors(res.errors);
    setPreflight(res.preflight);
    if (res.status !== "valid") return;
    const i = STEP_IDS.indexOf(step);
    if (i + 1 < STEP_IDS.length) go({ kind: "step", step: STEP_IDS[i + 1] });
    else go({ kind: "summary" });
  };

  const install = () => {
    if (!summary) return;
    const progress = call(() => api.install(true, summary.specHash));
    if (!progress) return;
    setEvents(progress);
    api.finishInstall();
    setSnapshot(api.state());
    go({ kind: "progress" });
  };

  const reveal = () => {
    const value = call(() => api.takeCredential());
    if (value) setCredential(value);
  };

  return (
    <div className="min-h-screen bg-[#f7f8f8] text-[#16191f]">
      <header className="flex items-center gap-3 border-b border-[#e6e8eb] bg-[#161d26] px-4 py-2">
        <Mark />
        <span className="text-[13px] text-white">Installer</span>
      </header>
      <div className="mx-auto flex max-w-5xl gap-6 p-6">
        <nav aria-label="Installer steps" className="w-48 shrink-0 text-[13px]">
          <ol className="space-y-1">
            {STEP_IDS.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  disabled={
                    !reachable.includes(s) ||
                    snapshot.session === "installing" ||
                    snapshot.session === "succeeded" ||
                    snapshot.session === "finished"
                  }
                  aria-current={screen.kind === "step" && screen.step === s ? "step" : undefined}
                  onClick={() => go({ kind: "step", step: s })}
                  className="w-full rounded px-2 py-1 text-left disabled:text-[#8c8c94] aria-[current=step]:bg-white aria-[current=step]:font-semibold"
                >
                  {`Step ${i + 1}: ${STEP_LABELS[s]}`}{" "}
                  <span className="text-[11px] text-[#5f6b7a]">{snapshot.status[s]}</span>
                </button>
              </li>
            ))}
            <li className="px-2 py-1">
              {summaryReady(snapshot.status) ? (
                "Review and install"
              ) : (
                <span className="text-[#8c8c94]">Review and install</span>
              )}
            </li>
          </ol>
        </nav>
        <main className="flex-1 space-y-4 rounded-lg border border-[#e6e8eb] bg-white p-5 text-[13px]">
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold">
              {screen.kind === "step"
                ? STEP_LABELS[screen.step]
                : screen.kind === "summary"
                  ? "Review and install"
                  : screen.kind === "progress"
                    ? "Installing"
                    : "Installation complete"}
            </h1>
            <SampleBadge />
          </div>
          {apiError && (
            <p role="alert" className="rounded-lg bg-[#fff7f7] p-3 text-[#d91515]">
              Installer API error: <span className="font-mono">{apiError}</span>
            </p>
          )}

          {screen.kind === "step" && (
            <>
              <StepForm
                step={screen.step}
                value={draft[screen.step]}
                onChange={(v) => setDraft({ ...draft, [screen.step]: v })}
                errors={errors}
              />
              <Preflight report={preflight} />
              <div className="flex gap-2">
                {STEP_IDS.indexOf(screen.step) > 0 && (
                  <OutlineButton
                    onClick={() => go({ kind: "step", step: STEP_IDS[STEP_IDS.indexOf(screen.step) - 1] })}
                  >
                    Previous
                  </OutlineButton>
                )}
                <OrangeButton onClick={() => save(screen.step)}>Next</OrangeButton>
              </div>
            </>
          )}

          {screen.kind === "summary" && summary && (
            <>
              <pre aria-label="VWSCluster" className="overflow-auto rounded-lg bg-[#f4f4f4] p-3 font-mono text-[12px]">
                {JSON.stringify(summary.cr, null, 2)}
              </pre>
              <div className="flex gap-2">
                <OutlineButton onClick={() => go({ kind: "step", step: "observability" })}>Previous</OutlineButton>
                <OrangeButton onClick={install}>Install</OrangeButton>
              </div>
            </>
          )}

          {screen.kind === "progress" && (
            <>
              <div
                role="progressbar"
                aria-valuenow={events.at(-1)?.percent ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 rounded bg-[#e6e8eb]"
              >
                <div className="h-2 rounded bg-[#0972d3]" style={{ width: `${events.at(-1)?.percent ?? 0}%` }} />
              </div>
              <ol aria-label="Install log" className="font-mono text-[12px]">
                {events.map((e) => (
                  <li key={e.phase}>{`[${e.index}/${e.total}] ${e.phase} ${e.state}`}</li>
                ))}
              </ol>
              <OrangeButton onClick={() => go({ kind: "done" })}>Continue</OrangeButton>
            </>
          )}

          {screen.kind === "done" && <DoneScreen api={api} credential={credential} onReveal={reveal} />}
        </main>
      </div>
    </div>
  );
}

function DoneScreen({
  api,
  credential,
  onReveal,
}: {
  api: MockInstaller;
  credential: string | null;
  onReveal: () => void;
}) {
  const result = api.result();
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[10rem_1fr] gap-y-2">
        <dt className="font-semibold">Console URL</dt>
        <dd>{dash(result.consoleUrl)}</dd>
        <dt className="font-semibold">Admin user</dt>
        <dd>{dash(result.adminUser)}</dd>
        <dt className="font-semibold">Initial password</dt>
        <dd>
          {credential ? (
            <span className="font-mono">{credential}</span>
          ) : result.credentialAvailable ? (
            <OutlineButton onClick={onReveal}>Show once</OutlineButton>
          ) : (
            "Already shown. Read it with kubectl get secret vws-initial-admin."
          )}
        </dd>
      </dl>
      <p className="text-[12px] text-[#5f6b7a]">The password is shown only once and is not saved in this browser.</p>
    </div>
  );
}
