"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Subnet, Vpc } from "@/types/console";
import { computeNav } from "@/lib/console-data";
import type { ApiError, Image, InstanceType } from "@/lib/vws-api/adapter";
import { launchInstancesAction } from "@/app/actions/resources";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { BreadcrumbBar } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { FieldLabel, InfoTip, OrangeButton, OutlineButton } from "@/components/sites/console/ui";

type Section = "name" | "image" | "type" | "key" | "network" | "storage";

function formatMemory(mib: number) {
  return mib % 1024 === 0 ? `${mib / 1024} GiB` : `${mib} MiB`;
}

const NOT_SUPPORTED = "The VWS API does not take this setting yet.";

export function LaunchView({
  images,
  instanceTypes,
  vpcs,
  subnets,
  loadError,
}: {
  images: Image[];
  instanceTypes: InstanceType[];
  vpcs: Vpc[];
  subnets: Subnet[];
  loadError: ApiError | null;
}) {
  const router = useRouter();
  const action = useApiAction();
  const [open, setOpen] = useState<Record<Section, boolean>>({
    name: true,
    image: true,
    type: true,
    key: true,
    network: true,
    storage: true,
  });
  const [name, setName] = useState("");
  const [tags, setTags] = useState<{ key: string; value: string }[]>([]);
  const [tag, setTag] = useState({ key: "", value: "" });
  const [imageId, setImageId] = useState(images[0]?.id ?? "");
  const [instanceType, setInstanceType] = useState(instanceTypes[0]?.id ?? "");
  const [vpcId, setVpcId] = useState(vpcs[0]?.id ?? "");
  const vpcSubnets = subnets.filter((subnet) => subnet.vpcId === vpcId);
  const [subnetChoice, setSubnetChoice] = useState("");
  const subnetId = vpcSubnets.some((subnet) => subnet.id === subnetChoice) ? subnetChoice : (vpcSubnets[0]?.id ?? "");
  const [count, setCount] = useState(1);
  const image = images.find((item) => item.id === imageId) ?? null;
  const type = instanceTypes.find((item) => item.id === instanceType) ?? null;
  const toggle = (key: Section) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  const ready = Boolean(image && type && subnetId) && count >= 1 && !action.pending;

  const launch = () =>
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
          keyPair: { kind: "none" },
        }),
      () => router.push("/compute/instances"),
    );

  return (
    <Shell tree={computeNav} navMode="overlay-only">
      <BreadcrumbBar
        crumbs={[
          { label: "EC2", href: "/compute/instances" },
          { label: "Instances", href: "/compute/instances" },
          { label: "Launch an instance" },
        ]}
      />
      <div className="flex min-h-0 flex-1 flex-col bg-white lg:flex-row">
        <div className="min-w-0 flex-1 overflow-auto px-5 py-4">
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-bold">Launch an instance</h1>
            <InfoTip text="Launch sends the request to the VWS API and waits until it is accepted." />
          </div>
          <p className="mt-1 max-w-3xl text-[13px] text-[#5f6b7a]">
            Start a virtual machine from an image. It takes a few simple steps, and the summary on the right follows
            your choices.
          </p>
          <ApiErrorAlert error={loadError} title="Launch options could not be loaded" />
          <div className="mt-4 max-w-4xl space-y-4 pb-8">
            <Card
              title="Name and tags"
              info="The name is stored as the Name tag. It can be blank."
              open={open.name}
              onToggle={() => toggle("name")}
            >
              <FieldLabel>Name</FieldLabel>
              <input
                className="field"
                placeholder="e.g. My Web Server"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  className="field max-w-40"
                  placeholder="Key"
                  value={tag.key}
                  onChange={(event) => setTag({ ...tag, key: event.target.value })}
                />
                <input
                  className="field max-w-40"
                  placeholder="Value"
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
            </Card>

            <Card
              title="Application and OS images"
              info="Images come from the VWS API."
              open={open.image}
              onToggle={() => toggle("image")}
            >
              {images.length === 0 ? (
                <p className="text-[13px] text-[#5f6b7a]">No images are available.</p>
              ) : (
                <>
                  <FieldLabel>Image</FieldLabel>
                  <select
                    className="field max-w-lg"
                    aria-label="Image"
                    value={imageId}
                    onChange={(event) => setImageId(event.target.value)}
                  >
                    {images.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name ? `${item.name} (${item.id})` : item.id}
                      </option>
                    ))}
                  </select>
                  {image ? (
                    <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-3">
                      <Fact label="Image ID" value={image.id} />
                      <Fact label="Name" value={image.name || "—"} />
                      <Fact label="State" value={image.state || "—"} />
                      <Fact label="Owner" value={image.owner || "—"} />
                      <Fact label="Created" value="—" />
                      <Fact label="User name" value="—" />
                    </dl>
                  ) : null}
                </>
              )}
            </Card>

            <Card
              title="Instance type"
              info="Machine types the VWS compute service runs."
              open={open.type}
              onToggle={() => toggle("type")}
            >
              <select
                className="field max-w-xs"
                aria-label="Instance type"
                value={instanceType}
                onChange={(event) => setInstanceType(event.target.value)}
              >
                {instanceTypes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[13px] text-[#5f6b7a]">
                {type
                  ? `${type.vcpus} vCPU · ${formatMemory(type.memoryMiB)} memory`
                  : "No instance types are available."}
              </p>
            </Card>

            <Card title="Key pair (login)" info={NOT_SUPPORTED} open={open.key} onToggle={() => toggle("key")}>
              <p className="text-[13px] text-[#5f6b7a]">Key pair: — ({NOT_SUPPORTED})</p>
            </Card>

            <Card
              title="Network settings"
              info="The instance joins a subnet in the chosen VPC."
              open={open.network}
              onToggle={() => toggle("network")}
            >
              <div className="space-y-3 text-[13px]">
                <div>
                  <FieldLabel>Network</FieldLabel>
                  <select
                    className="field max-w-lg"
                    aria-label="Network"
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
                  <FieldLabel>Subnet</FieldLabel>
                  <select
                    className="field max-w-lg"
                    aria-label="Subnet"
                    value={subnetId}
                    onChange={(event) => setSubnetChoice(event.target.value)}
                  >
                    {vpcSubnets.length === 0 ? <option value="">No subnets in this network</option> : null}
                    {vpcSubnets.map((subnet) => (
                      <option key={subnet.id} value={subnet.id}>
                        {subnet.id} ({subnet.ipv4Cidr})
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[#5f6b7a]">
                  Auto-assign public IP: — · Firewall (security group): — ({NOT_SUPPORTED})
                </p>
              </div>
            </Card>

            <Card title="Configure storage" info={NOT_SUPPORTED} open={open.storage} onToggle={() => toggle("storage")}>
              <p className="text-[13px] text-[#5f6b7a]">Root volume: — ({NOT_SUPPORTED})</p>
              <div className="mt-4 border-t border-[#e6e8eb] pt-3 text-[13px]">
                <p className="font-semibold">File systems</p>
                <p className="mt-1 text-[#5f6b7a]">
                  No file systems are attached. Shared file systems are not available in this console yet.
                </p>
              </div>
            </Card>
          </div>
        </div>
        <aside className="w-full shrink-0 bg-white p-4 lg:w-[300px]">
          <div className="space-y-3 rounded-lg border border-[#d5dbdb] p-4 text-[13px] lg:sticky lg:top-4">
            <p className="text-[16px] font-bold">Summary</p>
            <div>
              <div className="mb-1 font-semibold">Number of instances</div>
              <input
                className="field"
                aria-label="Number of instances"
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
              />
            </div>
            <SummaryRow label="Software Image (AMI)" value={image ? image.name || image.id : "—"} detail={image?.id} />
            <SummaryRow label="Virtual server type (instance type)" value={type?.id ?? "—"} />
            <SummaryRow label="Subnet" value={subnetId || "—"} />
            <ApiErrorAlert error={action.error} title="The instance could not be launched" />
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                className="text-[13px] text-[#16191f] hover:underline"
                onClick={() => router.push("/compute/instances")}
              >
                Cancel
              </button>
              <OrangeButton disabled={!ready} onClick={launch}>
                {action.pending ? "Launching…" : "Launch instance"}
              </OrangeButton>
            </div>
          </div>
        </aside>
      </div>
    </Shell>
  );
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
          <span aria-hidden className="w-3 text-[9px]">
            {open ? "▼" : "▶"}
          </span>
          <span className="text-[16px] font-bold">{title}</span>
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
      <dd className="break-all font-medium">{value}</dd>
    </div>
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
