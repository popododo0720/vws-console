"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { computeNav } from "@/lib/console-data";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { authorizeIngressAction } from "@/app/actions/resources";
import type { ApiError } from "@/lib/vws-api/adapter";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { RuleEditor, firstRuleError } from "@/components/sites/console/sg-rule-editor";
import { ingressPermissions } from "@/components/sites/console/sg-permissions";
import { OUTBOUND_UNAVAILABLE, RulesTable } from "@/components/sites/console/sg-rules-table";
import { OrangeButton, OutlineButton } from "@/components/sites/console/ui";
import type { SecurityGroup, SecurityGroupRule } from "@/types/console";

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
  const action = useApiAction();
  const router = useRouter();
  const [added, setAdded] = useState<SecurityGroupRule[]>([]);
  const [touched, setTouched] = useState(false);
  const label = direction === "in" ? "Add inbound rules" : "Edit outbound rules";
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

  const back = `/network/security-groups/${group.id}`;
  if (direction === "out") {
    return (
      <Shell tree={computeNav}>
        <PageHeader crumbs={crumbs} />
        <div className="px-4 py-6 text-[13px]">
          <p>{OUTBOUND_UNAVAILABLE}</p>
          <Link href={back} className="mt-3 inline-block text-[#006ce0] hover:underline">
            Back to {group.id}
          </Link>
        </div>
      </Shell>
    );
  }

  const mapped = ingressPermissions(added);
  const error = firstRuleError(added) ?? mapped.error;
  return (
    <Shell tree={computeNav}>
      <PageHeader
        crumbs={crumbs}
        info="New rules are added through the VWS API. It cannot remove or change existing rules yet."
      />
      <ApiErrorAlert error={action.error} title="The rules could not be added" />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 pb-6 text-[13px]">
        <section className="rounded-lg border border-[#d5dbdb] p-4">
          <h2 className="mb-2 text-[16px] font-semibold">Current inbound rules</h2>
          <RulesTable rules={group.rules} direction="in" />
        </section>
        <section className="rounded-lg border border-[#d5dbdb] p-4">
          <h2 className="mb-2 text-[16px] font-semibold">New inbound rules</h2>
          <RuleEditor direction="in" rules={added} onChange={setAdded} />
        </section>
        {touched && error ? (
          <p role="alert" className="text-[12px] text-[#d91515]">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <OutlineButton onClick={() => router.push(back)}>Cancel</OutlineButton>
          <OrangeButton
            disabled={action.pending || added.length === 0}
            onClick={() => {
              setTouched(true);
              if (error) return;
              action.run(
                () => authorizeIngressAction(group.id, mapped.permissions),
                () => router.push(back),
              );
            }}
          >
            Add rules
          </OrangeButton>
        </div>
      </div>
    </Shell>
  );
}
