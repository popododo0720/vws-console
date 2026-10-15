"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { computeNav } from "@/lib/console-data";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { createSecurityGroupAction } from "@/app/actions/resources";
import type { ApiError } from "@/lib/vws-api/adapter";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { RuleEditor, firstRuleError } from "@/components/sites/console/sg-rule-editor";
import { ingressPermissions } from "@/components/sites/console/sg-permissions";
import { OUTBOUND_UNAVAILABLE } from "@/components/sites/console/sg-rules-table";
import { FieldLabel, OrangeButton, OutlineButton } from "@/components/sites/console/ui";
import type { SecurityGroupRule, Vpc } from "@/types/console";

export function SecurityGroupCreateView({ vpcs, loadError }: { vpcs: Vpc[]; loadError: ApiError | null }) {
  const action = useApiAction();
  const router = useRouter();
  const [name, setName] = useState("");
  const [vpcId, setVpcId] = useState(vpcs[0]?.id ?? "");
  const [inbound, setInbound] = useState<SecurityGroupRule[]>([]);
  const [touched, setTouched] = useState(false);

  const nameError = !name.trim() ? "Security group name is required." : null;
  const vpcError = !vpcId ? "Create a VPC first; a security group belongs to one." : null;
  const mapped = ingressPermissions(inbound);
  const ruleError = firstRuleError(inbound) ?? mapped.error;
  const blocked = Boolean(nameError || ruleError || vpcError);

  return (
    <Shell tree={computeNav}>
      <PageHeader
        crumbs={[
          { label: "EC2", href: "/compute/instances" },
          { label: "Security Groups", href: "/network/security-groups" },
          { label: "Create security group" },
        ]}
        info="A security group acts as a virtual firewall for your instances. It is created through the VWS API."
      />
      <ApiErrorAlert error={loadError} title="VPCs could not be loaded" />
      <ApiErrorAlert error={action.error} title="The security group could not be created" />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 pb-6 text-[13px]">
        <section className="rounded-lg border border-[#d5dbdb] p-4">
          <h2 className="mb-3 text-[16px] font-semibold">Basic details</h2>
          <div className="grid max-w-xl gap-3">
            <div>
              <FieldLabel>Security group name</FieldLabel>
              <input
                className="field"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={touched && nameError ? true : undefined}
              />
              <p className="mt-1 text-[12px] text-[#5f6b7a]">Name cannot be edited after creation.</p>
              {touched && nameError ? <p className="mt-1 text-[12px] text-[#d91515]">{nameError}</p> : null}
            </div>
            <div>
              <FieldLabel>Description</FieldLabel>
              <p>—</p>
              <p className="mt-1 text-[12px] text-[#5f6b7a]">The VWS API does not take a description yet.</p>
            </div>
            <div>
              <FieldLabel>VPC</FieldLabel>
              <select className="field" value={vpcId} onChange={(event) => setVpcId(event.target.value)}>
                {vpcs.map((vpc) => (
                  <option key={vpc.id} value={vpc.id}>
                    {vpc.name ? `${vpc.id} (${vpc.name})` : vpc.id}
                  </option>
                ))}
              </select>
              {touched && vpcError ? <p className="mt-1 text-[12px] text-[#d91515]">{vpcError}</p> : null}
            </div>
          </div>
        </section>
        <section className="rounded-lg border border-[#d5dbdb] p-4">
          <h2 className="mb-1 text-[16px] font-semibold">Inbound rules</h2>
          {inbound.length === 0 ? (
            <p className="mb-2 text-[#5f6b7a]">
              This security group has no inbound rules, so it does not allow incoming traffic.
            </p>
          ) : null}
          <RuleEditor direction="in" rules={inbound} onChange={setInbound} />
        </section>
        <section className="rounded-lg border border-[#d5dbdb] p-4">
          <h2 className="mb-1 text-[16px] font-semibold">Outbound rules</h2>
          <p className="text-[#5f6b7a]">{OUTBOUND_UNAVAILABLE}</p>
        </section>
        {touched && ruleError ? (
          <p role="alert" className="text-[12px] text-[#d91515]">
            {ruleError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <OutlineButton onClick={() => router.push("/network/security-groups")}>Cancel</OutlineButton>
          <OrangeButton
            disabled={action.pending}
            onClick={() => {
              setTouched(true);
              if (blocked) return;
              action.run(
                () => createSecurityGroupAction(name.trim(), vpcId, mapped.permissions),
                () => router.push("/network/security-groups"),
              );
            }}
          >
            Create security group
          </OrangeButton>
        </div>
      </div>
    </Shell>
  );
}
