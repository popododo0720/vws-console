"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { computeNav } from "@/lib/console-data";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { saveInboundRulesAction } from "@/app/actions/resources";
import type { ApiError } from "@/lib/vws-api/adapter";
import {
  permissionLabel,
  planRuleChanges,
  ruleKey,
  savedInboundHref,
  type RuleChanges,
} from "@/lib/security-group-rules";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { RuleEditor, firstRuleError } from "@/components/sites/console/sg-rule-editor";
import { ingressPermissions } from "@/components/sites/console/sg-permissions";
import { OUTBOUND_UNAVAILABLE } from "@/components/sites/console/sg-rules-table";
import { OrangeButton, OutlineButton, PanelDialog } from "@/components/sites/console/ui";
import type { IngressPermission, SecurityGroup, SecurityGroupRule } from "@/types/console";

export function SecurityGroupRulesEditView({
  id,
  direction,
  group,
  loadError,
}: {
  id: string;
  direction: SecurityGroupRule["direction"];
  group: SecurityGroup | null;
  loadError: ApiError | null;
}) {
  const label = direction === "in" ? "Edit inbound rules" : "Edit outbound rules";
  const crumbs = [
    { label: "EC2", href: "/compute/instances" },
    { label: "Security Groups", href: "/network/security-groups" },
    { label: id, href: `/network/security-groups/${id}` },
    { label },
  ];

  if (!group) {
    return (
      <Shell tree={computeNav}>
        <PageHeader crumbs={crumbs} />
        <ApiErrorAlert error={loadError} title="Security groups could not be loaded" />
        <div className="px-4 py-6 text-[13px]">
          <p className="font-semibold">Security group not found</p>
          <Link href="/network/security-groups" className="mt-3 inline-block text-[#006ce0] hover:underline">
            Back to security groups
          </Link>
        </div>
      </Shell>
    );
  }

  if (direction === "out") {
    return (
      <Shell tree={computeNav}>
        <PageHeader crumbs={crumbs} />
        <div className="px-4 py-6 text-[13px]">
          <p>{OUTBOUND_UNAVAILABLE}</p>
          <Link
            href={`/network/security-groups/${group.id}`}
            className="mt-3 inline-block text-[#006ce0] hover:underline"
          >
            Back to {group.id}
          </Link>
        </div>
      </Shell>
    );
  }

  return <InboundRulesForm crumbs={crumbs} group={group} />;
}

function InboundRulesForm({ crumbs, group }: { crumbs: { label: string; href?: string }[]; group: SecurityGroup }) {
  const action = useApiAction();
  const router = useRouter();
  const [rows, setRows] = useState<SecurityGroupRule[]>(() =>
    group.rules.map((rule, index) => ({ ...rule, id: `stored-${index}` })),
  );
  const [touched, setTouched] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const back = `/network/security-groups/${group.id}`;
  const loaded = group.rules.flatMap((rule) => (rule.permission ? [rule.permission] : []));
  const mapped = ingressPermissions(rows);
  const error = firstRuleError(rows) ?? mapped.error;
  const changes = error ? null : planRuleChanges(loaded, mapped.permissions);
  const changeCount = changes ? changes.remove.length + changes.add.length : 0;

  const save = (confirmed: RuleChanges) =>
    action.run(
      async () => {
        const failed = await saveInboundRulesAction(group.id, confirmed);
        if (failed) router.refresh();
        return failed;
      },
      () => router.push(savedInboundHref(group.id)),
    );

  return (
    <Shell tree={computeNav}>
      <PageHeader
        crumbs={crumbs}
        info="Inbound rules control the incoming traffic that is allowed to reach the instances in this security group. The VWS API changes one rule per call, so a changed rule is deleted and then added again."
      />
      <ApiErrorAlert error={action.error} title="The inbound rules could not be saved" />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 pb-6 text-[13px]">
        <section className="rounded-lg border border-[#d5dbdb] p-4">
          <h2 className="mb-2 text-[16px] font-semibold">Inbound rules</h2>
          <RuleEditor direction="in" rules={rows} onChange={setRows} />
        </section>
        {previewing ? (
          <section aria-label="Preview changes" className="rounded-lg border border-[#d5dbdb] p-4">
            <h2 className="mb-2 text-[16px] font-semibold">Preview changes</h2>
            {changes ? (
              <ChangeList changes={changes} />
            ) : (
              <p className="text-[#5f6b7a]">Fix the rules to see changes.</p>
            )}
          </section>
        ) : null}
        {touched && error ? (
          <p role="alert" className="text-[12px] text-[#d91515]">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <OutlineButton onClick={() => router.push(back)}>Cancel</OutlineButton>
          <OutlineButton aria-pressed={previewing} onClick={() => setPreviewing(!previewing)}>
            Preview changes
          </OutlineButton>
          <OrangeButton
            disabled={action.pending || (changes !== null && changeCount === 0)}
            onClick={() => {
              setTouched(true);
              if (!changes) return;
              if (changes.remove.length > 0) setConfirming(true);
              else save(changes);
            }}
          >
            {action.pending ? "Saving…" : "Save rules"}
          </OrangeButton>
        </div>
      </div>
      <PanelDialog
        open={confirming && changes !== null}
        title="Delete inbound rules"
        onClose={() => setConfirming(false)}
        footer={
          <>
            <OutlineButton onClick={() => setConfirming(false)}>Cancel</OutlineButton>
            <OrangeButton
              onClick={() => {
                setConfirming(false);
                if (changes) save(changes);
              }}
            >
              Delete and save
            </OrangeButton>
          </>
        }
      >
        <p>
          Saving deletes {changes?.remove.length === 1 ? "this inbound rule" : "these inbound rules"} from{" "}
          <span className="font-mono">{group.id}</span>. Traffic that only they allow is blocked.
        </p>
        <RuleList rules={changes?.remove ?? []} />
      </PanelDialog>
    </Shell>
  );
}

function ChangeList({ changes }: { changes: RuleChanges }) {
  if (changes.remove.length + changes.add.length === 0) return <p className="text-[#5f6b7a]">No changes</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <h3 className="font-semibold">Rules to delete ({changes.remove.length})</h3>
        <RuleList rules={changes.remove} />
      </div>
      <div>
        <h3 className="font-semibold">Rules to add ({changes.add.length})</h3>
        <RuleList rules={changes.add} />
      </div>
    </div>
  );
}

function RuleList({ rules }: { rules: IngressPermission[] }) {
  if (rules.length === 0) return <p className="mt-1 text-[#5f6b7a]">None</p>;
  return (
    <ul className="mt-1 list-disc pl-5">
      {rules.map((rule) => (
        <li key={ruleKey(rule)}>{permissionLabel(rule)}</li>
      ))}
    </ul>
  );
}
