"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { computeNav } from "@/lib/console-data";
import { useConsole } from "@/components/sites/console/console-provider";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { RuleEditor, finalizeRules, firstRuleError } from "@/components/sites/console/sg-rule-editor";
import { OrangeButton, OutlineButton, SampleBadge } from "@/components/sites/console/ui";
import type { SecurityGroupRule } from "@/types/console";

export function SecurityGroupRulesEditView({ id, direction }: { id: string; direction: SecurityGroupRule["direction"] }) {
  const api = useConsole();
  const router = useRouter();
  const group = api.securityGroups.find((item) => item.id === id);
  const [draft, setDraft] = useState<SecurityGroupRule[] | null>(null);
  const [touched, setTouched] = useState(false);
  const label = direction === "in" ? "inbound" : "outbound";
  const crumbs = [
    { label: "EC2", href: "/compute/instances" },
    { label: "Security Groups", href: "/network/security-groups" },
    { label: id, href: `/network/security-groups/${id}` },
    { label: `Edit ${label} rules` },
  ];

  if (!group) {
    return (
      <Shell tree={computeNav}>
        <PageHeader crumbs={crumbs} />
        <div className="px-4 py-6 text-[13px]">
          <p className="font-semibold">Security group not found</p>
          <Link href="/network/security-groups" className="mt-3 inline-block text-[#006ce0] hover:underline">
            Back to security groups
          </Link>
        </div>
      </Shell>
    );
  }

  const rules = draft ?? group.rules.filter((rule) => rule.direction === direction);
  const error = firstRuleError(rules);
  const back = `/network/security-groups/${group.id}`;
  return (
    <Shell tree={computeNav}>
      <PageHeader
        crumbs={crumbs}
        info="Changes are saved to local sample data only."
        meta={api.mode === "sample" ? <SampleBadge /> : null}
      />
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-6 text-[13px]">
        <section className="rounded-lg border border-[#d5dbdb] p-4">
          <h2 className="mb-2 text-[16px] font-semibold">{direction === "in" ? "Inbound" : "Outbound"} rules</h2>
          <RuleEditor direction={direction} rules={rules} onChange={setDraft} />
        </section>
        {touched && error ? <p role="alert" className="mt-2 text-[12px] text-[#d91515]">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <OutlineButton onClick={() => router.push(back)}>Cancel</OutlineButton>
          <OrangeButton
            onClick={() => {
              setTouched(true);
              if (error) return;
              api.updateSecurityGroupRules(group.id, direction, finalizeRules(rules));
              router.push(back);
            }}
          >
            Save rules
          </OrangeButton>
        </div>
      </div>
    </Shell>
  );
}
