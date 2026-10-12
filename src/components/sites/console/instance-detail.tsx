"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Instance } from "@/types/console";
import { useConsole } from "@/components/sites/console/console-provider";
import { CopyText, dash } from "@/components/sites/console/ui";

export const instanceTabs = [
  { id: "details", label: "Details" },
  { id: "alarms", label: "Status and alarms" },
  { id: "monitoring", label: "Monitoring" },
  { id: "security", label: "Security" },
  { id: "networking", label: "Networking" },
  { id: "storage", label: "Storage" },
  { id: "tags", label: "Tags" },
];

export const stateMeta: Record<Instance["state"], { label: string; color: string }> = {
  running: { label: "Running", color: "#037f0c" },
  stopped: { label: "Stopped", color: "#d13212" },
  pending: { label: "Pending", color: "#006ce0" },
  stopping: { label: "Stopping", color: "#d13212" },
};

// Derived only from a real private IP; a missing IP yields no DNS name.
function privateDnsName(ip: string) {
  return ip ? `ip-${ip.replaceAll(".", "-")}.internal` : "";
}

export function StateDot({ state }: { state: Instance["state"] }) {
  const meta = stateMeta[state];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-bold text-[#5f6b7a]">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px]">{children}</dd>
    </div>
  );
}

function Fields({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">{children}</dl>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2 border-b border-[#e6e8eb] pb-1 text-[14px] font-bold">{title}</h3>
      {children}
    </section>
  );
}

function SimpleTable({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: string }) {
  return (
    <table className="w-full text-left text-[13px]">
      <thead>
        <tr className="border-b border-[#e6e8eb] text-[12px] text-[#5f6b7a]">
          {head.map((item) => (
            <th key={item} className="px-2 py-1.5 font-bold">{item}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={head.length} className="px-2 py-4 text-center text-[#5f6b7a]">{empty}</td>
          </tr>
        ) : (
          rows.map((row, index) => (
            <tr key={index} className="border-b border-[#eaeded]">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-2 py-1.5">{cell}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export function InstanceDetails({ instance }: { instance: Instance }) {
  return (
    <Fields>
      <Field label="Instance ID"><CopyText value={instance.id} /></Field>
      <Field label="Public IPv4 address">{dash(instance.publicIpv4)}</Field>
      <Field label="Private IPv4 addresses">{dash(instance.privateIpv4)}</Field>
      <Field label="IPv6 address">{dash(instance.ipv6)}</Field>
      <Field label="Instance state"><StateDot state={instance.state} /></Field>
      <Field label="Public IPv4 DNS">{dash(instance.publicDns)}</Field>
      <Field label="Hostname type">{dash(privateDnsName(instance.privateIpv4))}</Field>
      <Field label="Private IP DNS name (IPv4 only)">{dash(privateDnsName(instance.privateIpv4))}</Field>
      <Field label="Instance type">{instance.type}</Field>
      <Field label="Elastic IP addresses">{dash(instance.elasticIp)}</Field>
      <Field label="Availability Zone">{instance.availabilityZone}</Field>
      <Field label="VPC ID">{dash(instance.vpcId)}</Field>
      <Field label="AMI ID">{instance.imageId}</Field>
      <Field label="Key pair assigned at launch">{dash(instance.keyPair)}</Field>
      <Field label="Launch time">{instance.launchedAt}</Field>
    </Fields>
  );
}

export function InstanceTab({ tab, instance, hideSummary = false }: { tab: string; instance: Instance; hideSummary?: boolean }) {
  const api = useConsole();
  if (tab === "alarms") {
    return (
      <Section title="Status checks">
        <Fields>
          <Field label="System status check">
            {instance.status === "none" ? "—" : `${instance.checksPassed}/${instance.checksTotal} checks passed`}
          </Field>
          <Field label="Instance status check">{instance.status === "ok" ? "Passed" : instance.status}</Field>
          <Field label="Alarm status">No alarms configured</Field>
        </Fields>
      </Section>
    );
  }
  if (tab === "monitoring") {
    return <p className="text-[13px] text-[#5f6b7a]">No metric series is stored for this instance.</p>;
  }
  if (tab === "security") {
    const groups = api.securityGroups.filter((group) => instance.securityGroupIds.includes(group.id));
    return (
      <Section title="Security groups">
        <SimpleTable
          head={["Security group", "Name", "Inbound rules"]}
          empty="No security groups"
          rows={groups.map((group) => [group.id, group.groupName, `${group.rules.filter((rule) => rule.direction === "in").length}`])}
        />
      </Section>
    );
  }
  if (tab === "networking") {
    return (
      <Section title="Networking details">
        <Fields>
          <Field label="Public IPv4 address">{dash(instance.publicIpv4)}</Field>
          <Field label="Public IPv4 DNS">{dash(instance.publicDns)}</Field>
          <Field label="Private IPv4 addresses">{dash(instance.privateIpv4)}</Field>
          <Field label="VPC ID">{dash(instance.vpcId)}</Field>
          <Field label="Elastic IP addresses">{dash(instance.elasticIp)}</Field>
          <Field label="IPv6 address">{dash(instance.ipv6)}</Field>
        </Fields>
      </Section>
    );
  }
  if (tab === "storage") {
    const volumes = api.volumes.filter((volume) => volume.attachedTo === instance.id);
    return (
      <Section title="Block devices">
        <SimpleTable
          head={["Volume ID", "Type", "Size (GiB)", "Zone"]}
          empty="No volumes attached"
          rows={volumes.map((volume) => [volume.id, volume.volumeType, volume.sizeGiB, volume.availabilityZone])}
        />
      </Section>
    );
  }
  if (tab === "tags") {
    return (
      <Section title="Tags">
        <SimpleTable head={["Key", "Value"]} empty="No tags" rows={instance.name ? [["Name", instance.name]] : []} />
      </Section>
    );
  }
  if (hideSummary) {
    return (
      <Section title="Instance details">
        <Fields>
          <Field label="AMI ID">{instance.imageId}</Field>
          <Field label="Key pair assigned at launch">{dash(instance.keyPair)}</Field>
          <Field label="Launch time">{instance.launchedAt}</Field>
          <Field label="Monitoring">Disabled</Field>
          <Field label="Termination protection">Disabled</Field>
          <Field label="Shutdown behavior">Stop</Field>
        </Fields>
      </Section>
    );
  }
  return <InstanceDetails instance={instance} />;
}

export function InstanceLink({ id }: { id: string }) {
  return (
    <Link href={`/compute/instances/${id}`} className="text-[#006ce0] hover:underline" onClick={(event) => event.stopPropagation()}>
      {id}
    </Link>
  );
}
