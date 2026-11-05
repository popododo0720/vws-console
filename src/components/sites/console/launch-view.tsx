"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Search } from "lucide-react";
import type { Subnet, Vpc } from "@/types/console";
import { computeNav } from "@/lib/console-data";
import type { ApiError, Image, InstanceType } from "@/lib/vws-api/adapter";
import { launchInstancesAction } from "@/app/actions/resources";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { useKeyPairCreator } from "@/components/sites/console/key-pair-create";
import { BreadcrumbBar } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { InfoTip, OrangeButton, OutlineButton } from "@/components/sites/console/ui";
import { cn } from "@/lib/utils";
import type { KeyPairChoice, StoredKeyPair } from "@/lib/key-pair";

type Section = "image" | "type" | "key" | "network" | "storage" | "advanced" | "summary";

function formatMemory(mib: number) {
  return mib % 1024 === 0 ? `${mib / 1024} GiB` : `${mib} MiB`;
}

const NOT_SUPPORTED = "The VWS API does not take this setting yet.";
const PROCEED_WITHOUT_KEY_PAIR = "Proceed without a key pair (Not recommended)";
const blueLink = "text-[13px] font-semibold text-[#006ce0] hover:underline";

function launchNames(listed: StoredKeyPair[], created: StoredKeyPair[]): StoredKeyPair[] {
  const seen = new Set(listed.map((item) => item.name));
  const extra = created.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
  return [...listed, ...extra];
}

function autoAssignLabel(subnet: Subnet | undefined) {
  if (!subnet || subnet.autoAssignPublicIp === null) return "—";
  return subnet.autoAssignPublicIp ? "Enable" : "Disable";
}

export function LaunchView({
  images,
  instanceTypes,
  vpcs,
  subnets,
  keyPairs,
  loadError,
}: {
  images: Image[];
  instanceTypes: InstanceType[];
  vpcs: Vpc[];
  subnets: Subnet[];
  keyPairs: StoredKeyPair[];
  loadError: ApiError | null;
}) {
  const router = useRouter();
  const action = useApiAction();
  const [open, setOpen] = useState<Record<Section, boolean>>({
    image: true,
    type: true,
    key: true,
    network: true,
    storage: true,
    advanced: false,
    summary: true,
  });
  const [name, setName] = useState("");
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tags, setTags] = useState<{ key: string; value: string }[]>([]);
  const [tag, setTag] = useState({ key: "", value: "" });
  const [imageQuery, setImageQuery] = useState("");
  const [imageId, setImageId] = useState(images[0]?.id ?? "");
  const [instanceType, setInstanceType] = useState(instanceTypes[0]?.id ?? "");
  const [networkEditing, setNetworkEditing] = useState(false);
  const [vpcId, setVpcId] = useState(vpcs[0]?.id ?? "");
  const vpcSubnets = subnets.filter((subnet) => subnet.vpcId === vpcId);
  const [subnetChoice, setSubnetChoice] = useState("");
  const subnetId = vpcSubnets.some((subnet) => subnet.id === subnetChoice) ? subnetChoice : (vpcSubnets[0]?.id ?? "");
  const subnet = vpcSubnets.find((item) => item.id === subnetId);
  const [count, setCount] = useState(1);
  const [createdKeys, setCreatedKeys] = useState<StoredKeyPair[]>([]);
  const [keyChoice, setKeyChoice] = useState<KeyPairChoice>({ kind: "unset" });
  const keyOptions = launchNames(keyPairs, createdKeys);
  const creator = useKeyPairCreator({
    onCreated: (keyPair) => {
      setCreatedKeys((prev) => [...prev, keyPair]);
      setKeyChoice({ kind: "pair", name: keyPair.name });
      router.refresh();
    },
    knownNames: keyOptions.map((item) => item.name),
  });
  const query = imageQuery.trim().toLowerCase();
  const shownImages = query
    ? images.filter((item) => `${item.name}\n${item.id}`.toLowerCase().includes(query))
    : images;
  const image = images.find((item) => item.id === imageId) ?? null;
  const type = instanceTypes.find((item) => item.id === instanceType) ?? null;
  const toggle = (key: Section) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  const keyDecided = keyChoice.kind === "pair" || keyChoice.kind === "none";
  const ready = Boolean(image && type && subnetId) && count >= 1 && !action.pending && keyDecided;

  const launch = () => {
    if (keyChoice.kind !== "pair" && keyChoice.kind !== "none") return;
    action.run(
      () =>
        launchInstancesAction({
          imageId,
          instanceType,
          subnetId,
          count,
          tags: Object.fromEntries([
            ...(name.trim() ? [["Name", name.trim()]] : []),
            ...tags.map((item) => [item.key, item.value]),
          ]),
          keyPair: keyChoice,
        }),
      () => router.push("/compute/instances"),
    );
  };

  const reveal = (section: Section, id: string) => {
    setOpen((prev) => ({ ...prev, [section]: true }));
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return (
    <Shell tree={computeNav} navMode="overlay-only">
      <BreadcrumbBar
        crumbs={[
          { label: "EC2", href: "/compute/instances" },
          { label: "Instances", href: "/compute/instances" },
          { label: "Launch an instance" },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        <div className="mx-auto grid max-w-[1640px] items-start gap-6 px-6 py-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0 pb-8">
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-bold">Launch an instance</h1>
              <InfoTip text="Launch sends the request to the VWS API and waits until it is accepted." />
            </div>
            <p className="mt-1 text-[13px] text-[#16191f]">
              VWS EC2 allows you to create virtual machines, or instances, that run on the VWS Cloud. Quickly get
              started by following the simple steps below.
            </p>
            <ApiErrorAlert error={loadError} title="Launch options could not be loaded" />
            {creator.portal}
            <div className="mt-4 space-y-5">
              <Card id="launch-name" title="Name and tags" info="The name is stored as the Name tag. It can be blank.">
                <FieldLabel htmlFor="launch-name-input">Name</FieldLabel>
                <div className="flex flex-wrap items-center gap-4">
                  <input
                    id="launch-name-input"
                    className="field max-w-[640px] flex-1"
                    placeholder="e.g. My Web Server"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <button type="button" className={blueLink} aria-expanded={tagsOpen} onClick={() => setTagsOpen(true)}>
                    Add additional tags
                  </button>
                </div>
                {tagsOpen ? (
                  <div className="mt-3 border-t border-[#e6e8eb] pt-3">
                    <div className="flex flex-wrap gap-2">
                      <input
                        className="field max-w-48"
                        placeholder="Key"
                        aria-label="Tag key"
                        value={tag.key}
                        onChange={(event) => setTag({ ...tag, key: event.target.value })}
                      />
                      <input
                        className="field max-w-48"
                        placeholder="Value"
                        aria-label="Tag value"
                        value={tag.value}
                        onChange={(event) => setTag({ ...tag, value: event.target.value })}
                      />
                      <OutlineButton
                        onClick={() => {
                          const key = tag.key.trim();
                          if (!key || key === "Name") return;
                          setTags([...tags.filter((item) => item.key !== key), { key, value: tag.value }]);
                          setTag({ key: "", value: "" });
                        }}
                      >
                        Add tag
                      </OutlineButton>
                    </div>
                    {tags.length > 0 ? (
                      <ul className="mt-2 text-[13px] text-[#5f6b7a]">
                        {tags.map((item) => (
                          <li key={item.key}>
                            {item.key} = {item.value || "—"}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </Card>

              <Card
                id="launch-image"
                title="Application and OS Images (VWS Machine Image)"
                info="Images come from the VWS API."
                open={open.image}
                onToggle={() => toggle("image")}
              >
                <p className="text-[13px]">
                  An AMI contains the operating system, application server, and applications for your instance. If you
                  don&apos;t see a suitable AMI below, use the search field.
                </p>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#5f6b7a]" />
                  <input
                    className="field !pl-8"
                    aria-label="Search images"
                    placeholder="Search our full catalog of application and OS images"
                    value={imageQuery}
                    onChange={(event) => setImageQuery(event.target.value)}
                  />
                </div>
                <div className="mt-3 border-b border-[#e6e8eb]">
                  <span className="inline-block border-b-2 border-[#006ce0] px-2 pb-1.5 text-[13px] font-semibold text-[#006ce0]">
                    Quick Start
                  </span>
                </div>
                {shownImages.length === 0 ? (
                  <p className="mt-3 text-[13px] text-[#5f6b7a]">
                    {images.length === 0 ? "No images are available." : "No images match your search."}
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-1" role="radiogroup" aria-label="Quick Start images">
                    {shownImages.slice(0, 7).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={item.id === imageId}
                        className={cn(
                          "grid h-[88px] w-[96px] place-items-center rounded-lg border px-1 text-center text-[12px]",
                          item.id === imageId ? "border-2 border-[#006ce0] bg-[#f2f8fd]" : "border-[#c6c9ce]",
                        )}
                        onClick={() => setImageId(item.id)}
                      >
                        {item.name || item.id}
                      </button>
                    ))}
                  </div>
                )}
                {images.length > 0 ? (
                  <>
                    <FieldLabel htmlFor="launch-image-select" className="mt-4">
                      VWS Machine Image (AMI)
                    </FieldLabel>
                    <select
                      id="launch-image-select"
                      className="field"
                      value={imageId}
                      onChange={(event) => setImageId(event.target.value)}
                    >
                      {images.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name ? `${item.name} (${item.id})` : item.id}
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}
                {image ? (
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-5">
                    <Fact label="Architecture" value="—" />
                    <Fact label="Boot mode" value="—" />
                    <Fact label="AMI ID" value={image.id} />
                    <Fact label="Creation Date" value="—" />
                    <Fact label="Username" value="—" />
                  </dl>
                ) : null}
              </Card>

              <Card
                id="launch-type"
                title="Instance type"
                info="Machine types the VWS compute service runs."
                open={open.type}
                onToggle={() => toggle("type")}
              >
                <FieldLabel htmlFor="launch-type-select">Instance type</FieldLabel>
                <select
                  id="launch-type-select"
                  className="field max-w-[640px]"
                  value={instanceType}
                  onChange={(event) => setInstanceType(event.target.value)}
                >
                  {instanceTypes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id}
                    </option>
                  ))}
                </select>
                <p className="mt-1 flex flex-wrap gap-x-4 text-[12px] text-[#5f6b7a]">
                  {type ? (
                    <>
                      <span>Family: {type.id.split(".")[0]}</span>
                      <span>{type.vcpus} vCPU</span>
                      <span>{formatMemory(type.memoryMiB)} Memory</span>
                    </>
                  ) : (
                    "No instance types are available."
                  )}
                </p>
              </Card>

              <Card
                id="launch-key"
                title="Key pair (login)"
                info="You use a key pair to connect to the instance, and you need the private key file before you launch."
                open={open.key}
                onToggle={() => toggle("key")}
              >
                <p className="text-[13px]">
                  You can use a key pair to securely connect to your instance. Ensure that you have access to the
                  selected key pair before you launch the instance.
                </p>
                <FieldLabel htmlFor="launch-key-select" className="mt-3">
                  Key pair name - <i className="font-normal">required</i>
                </FieldLabel>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    id="launch-key-select"
                    className="field max-w-[640px] flex-1"
                    aria-label="Key pair name"
                    value={
                      keyChoice.kind === "pair"
                        ? (keyOptions.find((item) => item.name === keyChoice.name)?.id ?? "")
                        : keyChoice.kind === "opt-out" || keyChoice.kind === "none"
                          ? "proceed-without"
                          : ""
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) {
                        setKeyChoice({ kind: "unset" });
                        return;
                      }
                      if (value === "proceed-without") {
                        setKeyChoice({ kind: "opt-out" });
                        return;
                      }
                      const found = keyOptions.find((item) => item.id === value);
                      if (found) setKeyChoice({ kind: "pair", name: found.name });
                    }}
                  >
                    <option value="">Select</option>
                    <option value="proceed-without">{PROCEED_WITHOUT_KEY_PAIR}</option>
                    {keyOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label="Refresh key pairs"
                    className="text-[#5f6b7a] hover:text-[#16191f]"
                    onClick={() => router.refresh()}
                  >
                    <RefreshCw className="size-3.5" />
                  </button>
                  <button type="button" className={blueLink} onClick={creator.openGenerate}>
                    Create new key pair
                  </button>
                </div>
                {keyChoice.kind === "opt-out" || keyChoice.kind === "none" ? (
                  <div className="mt-3 space-y-2 text-[13px]">
                    <p>
                      If you proceed without a key pair, you will not be able to connect to the instance unless you
                      already know the password that is built into this AMI.
                    </p>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={keyChoice.kind === "none"}
                        onChange={(event) =>
                          setKeyChoice(event.target.checked ? { kind: "none" } : { kind: "opt-out" })
                        }
                      />
                      <span>
                        I acknowledge that I will not be able to connect to this instance unless I already know the
                        password built into this AMI.
                      </span>
                    </label>
                  </div>
                ) : null}
              </Card>

              <Card
                id="launch-network"
                title="Network settings"
                info="The instance joins a subnet in the chosen VPC."
                open={open.network}
                onToggle={() => toggle("network")}
                action={
                  networkEditing ? null : (
                    <OutlineButton
                      className="h-7 rounded-full border-[#006ce0] text-[#006ce0] hover:bg-[#f2f8fd]"
                      onClick={() => {
                        setOpen((prev) => ({ ...prev, network: true }));
                        setNetworkEditing(true);
                      }}
                    >
                      Edit
                    </OutlineButton>
                  )
                }
              >
                <div className="space-y-3 text-[13px]">
                  {networkEditing ? (
                    <>
                      <div>
                        <FieldLabel htmlFor="launch-vpc-select">
                          VPC - <i className="font-normal">required</i>
                        </FieldLabel>
                        <select
                          id="launch-vpc-select"
                          className="field max-w-[640px]"
                          value={vpcId}
                          onChange={(event) => setVpcId(event.target.value)}
                        >
                          {vpcs.length === 0 ? <option value="">No networks in this region</option> : null}
                          {vpcs.map((vpc) => (
                            <option key={vpc.id} value={vpc.id}>
                              {vpc.id} ({vpc.ipv4Cidr})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <FieldLabel htmlFor="launch-subnet-select">Subnet</FieldLabel>
                        <select
                          id="launch-subnet-select"
                          className="field max-w-[640px]"
                          value={subnetId}
                          onChange={(event) => setSubnetChoice(event.target.value)}
                        >
                          {vpcSubnets.length === 0 ? <option value="">No subnets in this network</option> : null}
                          {vpcSubnets.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.id} ({item.ipv4Cidr})
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <ReadOnly label="Network" value={vpcId || "No networks in this region"} />
                      <ReadOnly label="Subnet" value={subnetId || "No subnets in this network"} />
                    </>
                  )}
                  <ReadOnly label="Auto-assign public IP" value={autoAssignLabel(subnet)} />
                  <div>
                    <p className="font-semibold">Firewall (security groups)</p>
                    <p>
                      A security group is a set of firewall rules that control the traffic for your instance. Add rules
                      to allow specific traffic to reach your instance.
                    </p>
                    <div className="mt-2 grid max-w-[700px] gap-3 sm:grid-cols-2">
                      <ChoiceCard name="launch-firewall" label="Create security group" disabled />
                      <ChoiceCard name="launch-firewall" label="Select existing security group" disabled />
                    </div>
                    <p className="mt-2 text-[#5f6b7a]">{NOT_SUPPORTED}</p>
                  </div>
                </div>
              </Card>

              <Card
                id="launch-storage"
                title="Configure storage"
                info={NOT_SUPPORTED}
                open={open.storage}
                onToggle={() => toggle("storage")}
              >
                <p className="text-[13px]">
                  1x Root volume from the image. <span className="text-[#5f6b7a]">{NOT_SUPPORTED}</span>
                </p>
                <OutlineButton
                  disabled
                  className="mt-4 rounded-full border-[#006ce0] text-[#006ce0] disabled:border-[#c6c9ce] disabled:text-[#8d9aa8]"
                >
                  Add new volume
                </OutlineButton>
                <div className="-mx-4 mt-4 border-t border-[#e6e8eb] px-4 pt-3">
                  <p className="text-[16px] font-bold">File systems</p>
                </div>
                <div className="-mx-4 mt-3 grid gap-3 border-t border-[#e6e8eb] px-4 pt-3 sm:grid-cols-2">
                  <ChoiceCard name="launch-file-system" label="S3 Files - new" disabled />
                  <ChoiceCard name="launch-file-system" label="EFS" disabled />
                  <ChoiceCard name="launch-file-system" label="FSx" disabled />
                  <ChoiceCard name="launch-file-system" label="None" checked />
                </div>
              </Card>

              <Card
                id="launch-advanced"
                title="Advanced details"
                info={NOT_SUPPORTED}
                open={open.advanced}
                onToggle={() => toggle("advanced")}
              >
                <p className="text-[13px] text-[#5f6b7a]">{NOT_SUPPORTED}</p>
              </Card>
            </div>
          </div>

          <aside className="w-full lg:sticky lg:top-4">
            <section className="rounded-2xl border border-[#c6c9ce] bg-white text-[13px]">
              <div className="px-5 pt-4">
                <button
                  type="button"
                  className="flex items-center gap-2 text-left"
                  aria-expanded={open.summary}
                  onClick={() => toggle("summary")}
                >
                  <Caret open={open.summary} />
                  <span className="text-[20px] font-bold">Summary</span>
                </button>
              </div>
              {open.summary ? (
                <div className="space-y-4 px-5 pb-4 pt-3">
                  <div className="border-b border-[#e6e8eb] pb-4">
                    <div className="mb-1 flex items-center gap-2">
                      <label htmlFor="launch-count" className="font-semibold">
                        Number of instances
                      </label>
                      <InfoTip text="How many instances to launch with these settings, from 1 to 20." />
                    </div>
                    <input
                      id="launch-count"
                      className="field"
                      type="number"
                      min={1}
                      max={20}
                      value={count}
                      onChange={(event) => setCount(Number(event.target.value))}
                    />
                  </div>
                  <SummaryRow
                    label="Software Image (AMI)"
                    value={image ? image.name || image.id : "—"}
                    detail={image?.id}
                    onClick={() => reveal("image", "launch-image")}
                  />
                  <SummaryRow
                    label="Virtual server type (instance type)"
                    value={type?.id ?? "—"}
                    onClick={() => reveal("type", "launch-type")}
                  />
                  <SummaryRow
                    label="Firewall (security group)"
                    value="—"
                    onClick={() => reveal("network", "launch-network")}
                  />
                  <SummaryRow label="Storage (volumes)" value="—" onClick={() => reveal("storage", "launch-storage")} />
                </div>
              ) : null}
              <div className="border-t border-[#e6e8eb] px-5 py-4">
                <ApiErrorAlert error={action.error} title="The instance could not be launched" />
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className={cn(blueLink, "px-4")}
                    onClick={() => router.push("/compute/instances")}
                  >
                    Cancel
                  </button>
                  <OrangeButton className="rounded-full px-5" disabled={!ready} onClick={launch}>
                    {action.pending ? "Launching…" : "Launch instance"}
                  </OrangeButton>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <span aria-hidden className="w-3 text-[11px]">
      {open ? "▼" : "▶"}
    </span>
  );
}

function Card({
  id,
  title,
  info,
  open,
  onToggle,
  action,
  children,
}: {
  id: string;
  title: string;
  info: string;
  open?: boolean;
  onToggle?: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  const expanded = open ?? true;
  return (
    <section id={id} className="scroll-mt-4 rounded-2xl border border-[#c6c9ce] bg-white">
      <div className="flex items-center gap-2 px-4 py-3">
        {onToggle ? (
          <button type="button" className="flex items-center gap-2 text-left" onClick={onToggle} aria-expanded={open}>
            <Caret open={expanded} />
            <span className="text-[18px] font-bold">{title}</span>
          </button>
        ) : (
          <h2 className="text-[18px] font-bold">{title}</h2>
        )}
        <InfoTip text={info} />
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {expanded ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  );
}

function FieldLabel({ htmlFor, className, children }: { htmlFor: string; className?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1 block text-[13px] font-semibold", className)}>
      {children}
    </label>
  );
}

function ChoiceCard({
  name,
  label,
  checked = false,
  disabled = false,
}: {
  name: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex h-10 items-center gap-2 rounded-lg border px-3 text-[13px]",
        checked ? "border-2 border-[#006ce0] bg-[#f2f8fd]" : "border-[#c6c9ce]",
        disabled && "cursor-not-allowed text-[#8d9aa8]",
      )}
    >
      <input type="radio" name={name} checked={checked} disabled={disabled} readOnly />
      {label}
    </label>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-semibold">{label}</p>
      <p>{value}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  detail,
  onClick,
}: {
  label: string;
  value: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <div>
      <button type="button" className={blueLink} onClick={onClick}>
        {label}
      </button>
      <p>{value}</p>
      {detail ? <p className="text-[12px] text-[#5f6b7a]">{detail}</p> : null}
    </div>
  );
}
