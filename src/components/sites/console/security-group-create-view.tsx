"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { computeNav } from "@/lib/console-data";
import { useConsole } from "@/components/sites/console/console-provider";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { RuleEditor, finalizeRules, firstRuleError } from "@/components/sites/console/sg-rule-editor";
import { FieldLabel, OrangeButton, OutlineButton, SampleBadge } from "@/components/sites/console/ui";
import { makeRule, newRuleId } from "@/lib/security-group-rules";
import type { SecurityGroupRule } from "@/types/console";

export function SecurityGroupCreateView() {
  const api = useConsole();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [vpcId, setVpcId] = useState(api.vpcs[0]?.id ?? "");
  const [inbound, setInbound] = useState<SecurityGroupRule[]>([]);
  const [outbound, setOutbound] = useState<SecurityGroupRule[]>(() => [makeRule("out", "All", "All", "0.0.0.0/0", `new-${newRuleId()}`)]);
  const [touched, setTouched] = useState(false);

  const nameError = !name.trim() ? "Security group name is required." : null;
  const descriptionError = !description.trim() ? "Description is required." : null;
  const ruleError = firstRuleError([...inbound, ...outbound]);
  const blocked = Boolean(nameError || descriptionError || ruleError || !vpcId);

  return (
    <Shell tree={computeNav}>
      <PageHeader
        crumbs={[
          { label: "EC2", href: "/compute/instances" },
          { label: "Security Groups", href: "/network/security-groups" },
          { label: "Create security group" },
        ]}
        info="A security group acts as a virtual firewall for your instances. This console saves it to local sample data only."
        meta={api.mode === "sample" ? <SampleBadge /> : null}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 pb-6 text-[13px]">
        <section className="rounded-lg border border-[#d5dbdb] p-4">
          <h2 className="mb-3 text-[16px] font-semibold">Basic details</h2>
          <div className="grid max-w-xl gap-3">
            <div>
              <FieldLabel>Security group name</FieldLabel>
              <input className="field" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={touched && nameError ? true : undefined} />
              <p className="mt-1 text-[12px] text-[#5f6b7a]">Name cannot be edited after creation.</p>
              {touched && nameError ? <p className="mt-1 text-[12px] text-[#d91515]">{nameError}</p> : null}
            </div>
            <div>
              <FieldLabel>Description</FieldLabel>
              <input className="field" value={description} onChange={(event) => setDescription(event.target.value)} aria-invalid={touched && descriptionError ? true : undefined} />
              {touched && descriptionError ? <p className="mt-1 text-[12px] text-[#d91515]">{descriptionError}</p> : null}
            </div>
            <div>
              <FieldLabel>VPC</FieldLabel>
              <select className="field" value={vpcId} onChange={(event) => setVpcId(event.target.value)}>
                {api.vpcs.map((vpc) => (
                  <option key={vpc.id} value={vpc.id}>
                    {vpc.name ? `${vpc.id} (${vpc.name})` : vpc.id}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
        <section className="rounded-lg border border-[#d5dbdb] p-4">
          <h2 className="mb-1 text-[16px] font-semibold">Inbound rules</h2>
          {inbound.length === 0 ? <p className="mb-2 text-[#5f6b7a]">This security group has no inbound rules, so it does not allow incoming traffic.</p> : null}
          <RuleEditor direction="in" rules={inbound} onChange={setInbound} />
        </section>
        <section className="rounded-lg border border-[#d5dbdb] p-4">
          <h2 className="mb-1 text-[16px] font-semibold">Outbound rules</h2>
          <RuleEditor direction="out" rules={outbound} onChange={setOutbound} />
        </section>
        {touched && ruleError ? <p role="alert" className="text-[12px] text-[#d91515]">{ruleError}</p> : null}
        <div className="flex justify-end gap-2">
          <OutlineButton onClick={() => router.push("/network/security-groups")}>Cancel</OutlineButton>
          <OrangeButton
            onClick={() => {
              setTouched(true);
              if (blocked) return;
              const id = api.createSecurityGroup({
                name: name.trim(),
                groupName: name.trim(),
                description: description.trim(),
                vpcId,
                inbound: finalizeRules(inbound),
                outbound: finalizeRules(outbound),
              });
              router.push(`/network/security-groups/${id}`);
            }}
          >
            Create security group
          </OrangeButton>
        </div>
      </div>
    </Shell>
  );
}
