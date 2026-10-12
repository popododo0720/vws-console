"use client";

import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Code } from "lucide-react";
import type { LaunchDraft } from "@/types/console";
import { computeNav, instanceTypes, machineImages, volumeTypeOptions } from "@/lib/console-data";
import { useConsole } from "@/components/sites/console/console-provider";
import { Shell } from "@/components/sites/console/shell";
import {
  FieldLabel,
  InfoTip,
  OrangeButton,
  OutlineButton,
  PanelDialog,
} from "@/components/sites/console/ui";
import { cn } from "@/lib/utils";

type Section = "name" | "image" | "type" | "key" | "network" | "storage";

function initialDraft(): LaunchDraft {
  return {
    name: "",
    tags: [],
    imageId: machineImages[0].id,
    instanceType: "std.micro",
    keyPair: "",
    vpcId: "",
    subnet: "No preference",
    publicIp: true,
    firewall: "create",
    securityGroupId: "",
    allowSsh: true,
    sshCidr: "0.0.0.0/0",
    allowHttps: false,
    allowHttp: false,
    volumeGiB: 8,
    volumeType: "General SSD",
    count: 1,
  };
}

export function LaunchView() {
  const api = useConsole();
  const router = useRouter();
  const [draft, setDraft] = useState<LaunchDraft>(initialDraft);
  const [open, setOpen] = useState<Record<Section, boolean>>({
    name: true,
    image: true,
    type: true,
    key: true,
    network: true,
    storage: true,
  });
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [allGenerations, setAllGenerations] = useState(false);
  const [compare, setCompare] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tag, setTag] = useState({ key: "", value: "" });
  const [addingKey, setAddingKey] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [preview, setPreview] = useState(false);

  const vpcId = api.vpcs.some((vpc) => vpc.id === draft.vpcId) ? draft.vpcId : (api.vpcs[0]?.id ?? "");
  const groupId = api.securityGroups.some((group) => group.id === draft.securityGroupId)
    ? draft.securityGroupId
    : (api.securityGroups[0]?.id ?? "");
  const image = machineImages.find((item) => item.id === draft.imageId) ?? machineImages[0];
  const types = instanceTypes.filter((item) => allGenerations || item.currentGen);
  const type = instanceTypes.find((item) => item.id === draft.instanceType) ?? types[0];
  const images = machineImages.filter((item) => {
    const q = query.trim().toLowerCase();
    return !q || `${item.name} ${item.version} ${item.id}`.toLowerCase().includes(q);
  });
  const patch = (partial: Partial<LaunchDraft>) => setDraft((prev) => ({ ...prev, ...partial }));

  const launch = () => {
    api.launch({ ...draft, vpcId, securityGroupId: groupId, instanceType: type.id, count: draft.count });
    router.push("/compute/instances");
  };

  const spec = {
    count: draft.count,
    name: draft.name,
    tags: draft.tags.filter((item) => item.key),
    image: image.id,
    type: type.id,
    keyPair: draft.keyPair || null,
    network: { vpcId, subnet: draft.subnet, publicIp: draft.publicIp },
    firewall:
      draft.firewall === "create"
        ? { mode: "create", ssh: draft.allowSsh ? draft.sshCidr : null, https: draft.allowHttps, http: draft.allowHttp }
        : { mode: "select", securityGroupId: groupId },
    storage: { volumeType: draft.volumeType, sizeGiB: draft.volumeGiB },
  };

  return (
    <Shell tree={computeNav} navMode="overlay-only">
      <div className="flex min-h-0 flex-1 flex-col bg-white lg:flex-row">
        <div className="min-w-0 flex-1 overflow-auto px-5 py-4">
          <p className="flex flex-wrap items-center gap-1 text-[13px] text-[#5f6b7a]">
            <button type="button" className="text-[#006ce0] hover:underline" onClick={() => router.push("/compute/instances")}>
              EC2
            </button>
            <ChevronRight className="size-3.5" />
            <button type="button" className="text-[#006ce0] hover:underline" onClick={() => router.push("/compute/instances")}>
              Instances
            </button>
            <ChevronRight className="size-3.5" />
            <span>Launch an instance</span>
          </p>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-[22px] font-semibold">Launch an instance</h1>
            <InfoTip text="This form creates mock instances and volumes in the current region. Nothing is sent to a cloud provider." />
          </div>
          <p className="mt-2 max-w-3xl text-[13px] text-[#5f6b7a]">
            Start a virtual machine from an image. The summary on the right follows the choices below.
          </p>
          <div className="mt-4 max-w-4xl space-y-4 pb-8">
            <Card title="Name and tags" info="The name is a label. It can be blank." open={open.name} onToggle={() => toggle(setOpen, "name")}>
              <FieldLabel>Name</FieldLabel>
              <input className="field max-w-lg" placeholder="e.g. My Web Server" value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
              <button type="button" className="mt-3 text-[13px] text-[#006ce0] hover:underline" onClick={() => setAddingTag((value) => !value)}>
                Add additional tags
              </button>
              {addingTag ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input className="field max-w-40" placeholder="Key" value={tag.key} onChange={(event) => setTag({ ...tag, key: event.target.value })} />
                  <input className="field max-w-40" placeholder="Value" value={tag.value} onChange={(event) => setTag({ ...tag, value: event.target.value })} />
                  <OutlineButton
                    onClick={() => {
                      if (!tag.key.trim()) return;
                      patch({ tags: [...draft.tags, { key: tag.key.trim(), value: tag.value }] });
                      setTag({ key: "", value: "" });
                    }}
                  >
                    Add tag
                  </OutlineButton>
                </div>
              ) : null}
              {draft.tags.length > 0 ? (
                <ul className="mt-2 text-[13px] text-[#5f6b7a]">
                  {draft.tags.map((item) => (
                    <li key={item.key}>{item.key} = {item.value || "—"}</li>
                  ))}
                </ul>
              ) : null}
            </Card>

            <Card title="Application and OS images" info="An image packages the operating system and software the instance starts with." open={open.image} onToggle={() => toggle(setOpen, "image")}>
              <input className="field" placeholder="Search images by name" value={query} onChange={(event) => setQuery(event.target.value)} />
              <p className="mb-2 mt-4 text-[13px] font-semibold text-[#006ce0]">Quick start</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => patch({ imageId: item.id })}
                    className={cn(
                      "flex h-[84px] w-[92px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border bg-white text-[11px]",
                      item.id === image.id ? "border-[#006ce0] ring-1 ring-[#006ce0]" : "border-[#d5dbdb]",
                    )}
                  >
                    <span className="grid size-8 place-items-center rounded-md text-[11px] font-bold text-white" style={{ background: item.swatch }}>
                      {item.mark}
                    </span>
                    {item.name}
                  </button>
                ))}
                {images.length === 0 ? <p className="text-[13px] text-[#5f6b7a]">No images match.</p> : null}
              </div>
              <div className="mt-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{image.name} {image.version}</p>
                    <p className="text-[12px] text-[#5f6b7a]">{image.id}</p>
                  </div>
                  <select className="field w-auto" value={image.id} onChange={(event) => patch({ imageId: event.target.value })}>
                    {machineImages.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.starter ? `${item.name} · starter` : item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-3 max-w-3xl text-[13px] leading-5">{image.description}</p>
                <dl className="mt-4 grid gap-3 text-[13px] sm:grid-cols-3">
                  <Fact label="Architecture" value={image.arch} />
                  <Fact label="Boot mode" value={image.boot} />
                  <Fact label="Image ID" value={image.id} />
                  <Fact label="Creation date" value={image.created} />
                  <Fact label="Username" value={image.username} />
                  <Fact label="Provider" value="Verified provider" />
                </dl>
              </div>
            </Card>

            <Card title="Instance type" info="Sample rates are illustrative and are not a price quote." open={open.type} onToggle={() => toggle(setOpen, "type")}>
              <div className="rounded-lg border border-[#d5dbdb] p-3 text-[13px]">
                <span className="font-semibold">{type.id}</span>
                <span className="mx-2 text-[#5f6b7a]">{type.vcpu} vCPU</span>
                <span className="text-[#5f6b7a]">{type.memoryGiB} GiB memory</span>
                <p className="mt-1 text-[#5f6b7a]">
                  Family: {type.family} · Current generation: {type.currentGen ? "true" : "false"} · Sample rate {type.sampleHourly} USD per hour
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <select className="field max-w-xs" value={type.id} onChange={(event) => patch({ instanceType: event.target.value })}>
                  {types.map((item) => (
                    <option key={item.id} value={item.id}>{item.id}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={allGenerations} onChange={(event) => setAllGenerations(event.target.checked)} />
                  All generations
                </label>
                <button type="button" className="text-[13px] text-[#006ce0] hover:underline" onClick={() => setCompare((value) => !value)}>
                  Compare instance types
                </button>
              </div>
              {compare ? (
                <table className="mt-3 w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b text-[#5f6b7a]">
                      <th className="py-1">Type</th>
                      <th>vCPU</th>
                      <th>Memory</th>
                      <th>Sample hourly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {types.map((item) => (
                      <tr key={item.id} className="border-b border-[#f2f3f3]">
                        <td className="py-1">{item.id}</td>
                        <td>{item.vcpu}</td>
                        <td>{item.memoryGiB} GiB</td>
                        <td>{item.sampleHourly}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </Card>

            <Card title="Key pair (login)" info="The private key stays with you. This preview only stores the key name." open={open.key} onToggle={() => toggle(setOpen, "key")}>
              <p className="mb-2 text-[13px] text-[#5f6b7a]">You can use a key pair to securely connect to your instance.</p>
              <div className="flex flex-wrap items-center gap-3">
                <select className="field max-w-sm" value={draft.keyPair} onChange={(event) => patch({ keyPair: event.target.value })}>
                  <option value="">Select</option>
                  {api.keyPairs.map((item) => (
                    <option key={item.name} value={item.name}>{item.name}</option>
                  ))}
                </select>
                <button type="button" className="text-[13px] text-[#006ce0] hover:underline" onClick={() => setAddingKey((value) => !value)}>
                  Create new key pair
                </button>
              </div>
              {addingKey ? (
                <div className="mt-2 flex gap-2">
                  <input className="field max-w-xs" placeholder="Key pair name" value={keyName} onChange={(event) => setKeyName(event.target.value)} />
                  <OutlineButton
                    onClick={() => {
                      api.addKeyPair(keyName);
                      patch({ keyPair: keyName.trim() });
                      setKeyName("");
                      setAddingKey(false);
                    }}
                  >
                    Add
                  </OutlineButton>
                </div>
              ) : null}
            </Card>

            <Card title="Network settings" info="The instance joins a VPC in the current region." open={open.network} onToggle={() => toggle(setOpen, "network")}>
              <div className="space-y-3 text-[13px]">
                <div>
                  <FieldLabel>Network</FieldLabel>
                  <select className="field max-w-lg" value={vpcId} onChange={(event) => patch({ vpcId: event.target.value })}>
                    {api.vpcs.length === 0 ? <option value="">No networks in this region</option> : null}
                    {api.vpcs.map((vpc) => (
                      <option key={vpc.id} value={vpc.id}>{vpc.name ? `${vpc.name} (${vpc.id})` : vpc.id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>Subnet</FieldLabel>
                  <select className="field max-w-lg" value={draft.subnet} onChange={(event) => patch({ subnet: event.target.value })}>
                    <option>No preference</option>
                    <option>north-a</option>
                    <option>north-b</option>
                  </select>
                  <p className="mt-1 text-[#5f6b7a]">No preference uses the default subnet in any availability zone.</p>
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={draft.publicIp} onChange={(event) => patch({ publicIp: event.target.checked })} />
                  Auto-assign public IP
                </label>
                <div>
                  <p className="mb-2 font-semibold">Firewall (security group)</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Choice checked={draft.firewall === "create"} label="Create security group" onSelect={() => patch({ firewall: "create" })} />
                    <Choice checked={draft.firewall === "select"} label="Select existing security group" onSelect={() => patch({ firewall: "select" })} />
                  </div>
                </div>
                {draft.firewall === "create" ? (
                  <div className="space-y-2 rounded-lg border border-[#e6e8eb] p-3">
                    <p>Rules for the new group:</p>
                    <label className="flex flex-wrap items-center gap-2">
                      <input type="checkbox" checked={draft.allowSsh} onChange={(event) => patch({ allowSsh: event.target.checked })} />
                      Allow SSH traffic from
                      <select className="field w-auto" disabled={!draft.allowSsh} value={draft.sshCidr} onChange={(event) => patch({ sshCidr: event.target.value })}>
                        <option value="0.0.0.0/0">Anywhere 0.0.0.0/0</option>
                        <option value="203.0.113.4/32">My IP 203.0.113.4/32</option>
                        <option value="10.0.0.0/8">Custom 10.0.0.0/8</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={draft.allowHttps} onChange={(event) => patch({ allowHttps: event.target.checked })} />
                      Allow HTTPS traffic from the internet
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={draft.allowHttp} onChange={(event) => patch({ allowHttp: event.target.checked })} />
                      Allow HTTP traffic from the internet
                    </label>
                  </div>
                ) : (
                  <select className="field max-w-lg" value={groupId} onChange={(event) => patch({ securityGroupId: event.target.value })}>
                    {api.securityGroups.map((group) => (
                      <option key={group.id} value={group.id}>{group.groupName} ({group.id})</option>
                    ))}
                  </select>
                )}
              </div>
            </Card>

            <Card title="Storage" info="Each instance gets one root volume." open={open.storage} onToggle={() => toggle(setOpen, "storage")}>
              <div className="flex flex-wrap gap-3">
                <label className="text-[13px]">
                  Size (GiB)
                  <input className="field mt-1" type="number" min={1} value={draft.volumeGiB} onChange={(event) => patch({ volumeGiB: Number(event.target.value) })} />
                </label>
                <label className="text-[13px]">
                  Type
                  <select className="field mt-1" value={draft.volumeType} onChange={(event) => patch({ volumeType: event.target.value })}>
                    {volumeTypeOptions.map((item) => (
                      <option key={item.id}>{item.id}</option>
                    ))}
                  </select>
                </label>
              </div>
            </Card>
          </div>
        </div>
        <aside className="w-full shrink-0 bg-white p-4 lg:w-[300px]">
          <div className="rounded-lg border border-[#d5dbdb] p-4 lg:sticky lg:top-4">
            <button type="button" className="flex w-full items-center justify-between" onClick={() => setSummaryOpen((value) => !value)}>
              <span className="text-[16px] font-semibold">Summary</span>
              <ChevronRight className={cn("size-4 transition", summaryOpen && "rotate-90")} />
            </button>
            {summaryOpen ? (
              <div className="mt-3 space-y-3 text-[13px]">
                <div>
                  <div className="mb-1 flex items-center gap-2 font-semibold">
                    Number of instances <InfoTip text="Launch creates this many identical instances." />
                  </div>
                  <input className="field" type="number" min={1} max={20} value={draft.count} onChange={(event) => patch({ count: Number(event.target.value) })} />
                </div>
                <SummaryRow label="Software image" value={`${image.name} ${image.version}`} detail={image.id} />
                <SummaryRow label="Virtual server type" value={type.id} />
                <SummaryRow label="Firewall" value={draft.firewall === "create" ? "New security group" : groupId || "None"} />
                <SummaryRow label="Storage" value={`${draft.count} volume(s) - ${draft.volumeGiB} GiB`} />
                <div className="flex items-center justify-between pt-2">
                  <button type="button" className="text-[13px] text-[#16191f] hover:underline" onClick={() => router.push("/compute/instances")}>
                    Cancel
                  </button>
                  <OrangeButton onClick={launch}>Launch instance</OrangeButton>
                </div>
                <button type="button" className="inline-flex items-center gap-1 text-[#006ce0] hover:underline" onClick={() => setPreview(true)}>
                  <Code className="size-3.5" /> Preview code
                </button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
      <PanelDialog open={preview} title="Launch preview" onClose={() => setPreview(false)}
        footer={<OutlineButton onClick={() => setPreview(false)}>Close</OutlineButton>}
      >
        <pre className="overflow-auto rounded-md bg-[#f7f8f8] p-3 text-[12px] leading-5">{JSON.stringify(spec, null, 2)}</pre>
      </PanelDialog>
    </Shell>
  );
}

function toggle(setOpen: Dispatch<SetStateAction<Record<Section, boolean>>>, key: Section) {
  setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
}

function Card({
  title,
  info,
  open,
  onToggle,
  children,
}: {
  title: string;
  info: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#d5dbdb] bg-white">
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" className="flex items-center gap-2 text-left" onClick={onToggle} aria-expanded={open}>
          <ChevronRight className={cn("size-4 transition", open && "rotate-90")} />
          <span className="text-[16px] font-semibold">{title}</span>
        </button>
        <InfoTip text={info} />
      </div>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[#5f6b7a]">{label}</dt>
      <dd className="font-medium">
        {label === "Provider" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f6e9] px-2 py-0.5 text-[12px] text-[#037f0c]">
            <Check className="size-3" /> {value}
          </span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function Choice({ checked, label, onSelect }: { checked: boolean; label: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left",
        checked ? "border-[#006ce0] ring-1 ring-[#006ce0]" : "border-[#c6c9ce]",
      )}
    >
      <span className={cn("grid size-4 place-items-center rounded-full border", checked ? "border-[#006ce0]" : "border-[#8d9aa8]")}>
        {checked ? <span className="size-2 rounded-full bg-[#006ce0]" /> : null}
      </span>
      {label}
    </button>
  );
}

function SummaryRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <p className="font-semibold">{label}</p>
      <p>{value}</p>
      {detail ? <p className="text-[12px] text-[#5f6b7a]">{detail}</p> : null}
    </div>
  );
}
