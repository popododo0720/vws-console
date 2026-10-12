"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ACCOUNT,
  createEmptyAccount,
  createSampleAccount,
  DEFAULT_SG_ID,
  HOME_REGION,
  machineImages,
  REGIONS,
  volumeTypeOptions,
  zonesFor,
} from "@/lib/console-data";
import type {
  Bucket,
  Dataset,
  Instance,
  InstanceState,
  InternetGateway,
  LaunchDraft,
  RouteTable,
  SecurityGroup,
  Subnet,
  ElasticIp,
  Volume,
  Snapshot,
  Vpc,
} from "@/types/console";

type Mode = "empty" | "sample";
type Density = "comfortable" | "compact";

type ConsoleApi = {
  account: typeof ACCOUNT;
  regions: readonly string[];
  region: string;
  setRegion: (region: string) => void;
  mode: Mode;
  showEmpty: () => void;
  showSample: () => void;
  density: Density;
  setDensity: (density: Density) => void;
  instances: Instance[];
  volumes: Volume[];
  snapshots: Snapshot[];
  securityGroups: SecurityGroup[];
  vpcs: Vpc[];
  subnets: Subnet[];
  routeTables: RouteTable[];
  internetGateways: InternetGateway[];
  elasticIps: ElasticIp[];
  buckets: Bucket[];
  keyPairs: Dataset["keyPairs"];
  renameInstance: (id: string, name: string) => void;
  setInstanceState: (ids: string[], state: InstanceState) => void;
  terminateInstances: (ids: string[]) => void;
  launch: (draft: LaunchDraft) => void;
  createVolume: (input: { name: string; volumeType: string; sizeGiB: number; availabilityZone: string }) => void;
  deleteVolumes: (ids: string[]) => void;
  modifyVolume: (id: string, input: { volumeType: string; sizeGiB: number }) => void;
  createSnapshot: (input: { volumeId: string; name: string; description: string }) => void;
  deleteSnapshots: (ids: string[]) => void;
  createSecurityGroup: (input: { name: string; groupName: string; description: string; vpcId: string; allowSsh: boolean }) => void;
  deleteSecurityGroups: (ids: string[]) => void;
  createVpc: (input: { name: string; ipv4Cidr: string }) => void;
  deleteVpcs: (ids: string[]) => void;
  createSubnet: (input: { name: string; vpcId: string; ipv4Cidr: string; availabilityZone: string }) => string | null;
  deleteSubnets: (ids: string[]) => void;
  createRouteTable: (input: { name: string; vpcId: string }) => void;
  deleteRouteTables: (ids: string[]) => void;
  addRoute: (tableId: string, destination: string, target: string) => string | null;
  associateSubnet: (tableId: string, subnetId: string) => void;
  createInternetGateway: (name: string) => void;
  attachInternetGateway: (id: string, vpcId: string) => string | null;
  detachInternetGateway: (id: string) => void;
  deleteInternetGateways: (ids: string[]) => void;
  allocateElasticIp: (name: string) => void;
  associateElasticIp: (allocationId: string, instanceId: string) => void;
  disassociateElasticIp: (allocationId: string) => void;
  releaseElasticIps: (ids: string[]) => void;
  createBucket: (input: { name: string; kind: Bucket["kind"] }) => string | null;
  deleteBuckets: (names: string[]) => void;
  addKeyPair: (name: string) => void;
};

const ConsoleContext = createContext<ConsoleApi | null>(null);

function newId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${hex}`;
}

function isCidr(value: string) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(value);
  if (!match) return false;
  return match.slice(1, 5).every((part) => Number(part) <= 255) && Number(match[5]) <= 32;
}

function ipToInt(ip: string) {
  return ip.split(".").reduce((acc, part) => acc * 256 + Number(part), 0);
}

function validateSubnetCidr(cidr: string, vpc: Vpc | undefined) {
  if (!vpc) return "Choose a VPC.";
  if (!isCidr(cidr)) return "IPv4 CIDR must look like 10.0.1.0/24.";
  const prefix = Number(cidr.split("/")[1]);
  if (prefix < 16 || prefix > 28) return "Subnet size must be between /16 and /28.";
  const [vpcBase, vpcPrefix] = vpc.ipv4Cidr.split("/");
  const size = 2 ** (32 - prefix);
  const start = ipToInt(cidr.split("/")[0]);
  const vpcStart = ipToInt(vpcBase);
  const vpcSize = 2 ** (32 - Number(vpcPrefix));
  if (start % size !== 0) return "CIDR block must start on a boundary of its own size.";
  if (start < vpcStart || start + size > vpcStart + vpcSize) return `CIDR block must be inside the VPC range ${vpc.ipv4Cidr}.`;
  return null;
}

function nextTestAddress(existing: ElasticIp[]) {
  const used = new Set(existing.map((item) => item.address));
  for (let last = 50; last < 250; last += 1) {
    const candidate = `203.0.113.${last}`;
    if (!used.has(candidate)) return candidate;
  }
  return "203.0.113.250";
}

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [region, setRegion] = useState<string>(HOME_REGION);
  const [mode, setMode] = useState<Mode>("empty");
  const [data, setData] = useState<Dataset>(() => createEmptyAccount());
  const [density, setDensity] = useState<Density>("comfortable");

  const api = useMemo<ConsoleApi>(() => {
    const instances = data.instances.filter((item) => item.region === region);
    const volumes = data.volumes.filter((item) => item.region === region);
    const snapshots = data.snapshots.filter((item) => item.region === region);
    const securityGroups = data.securityGroups.filter((item) => item.region === region);
    const vpcs = data.vpcs.filter((item) => item.region === region);
    const subnets = data.subnets.filter((item) => item.region === region);
    const routeTables = data.routeTables.filter((item) => item.region === region);
    const internetGateways = data.internetGateways.filter((item) => item.region === region);
    const elasticIps = data.elasticIps.filter((item) => item.region === region);

    return {
      account: ACCOUNT,
      regions: REGIONS,
      region,
      setRegion,
      mode,
      density,
      setDensity,
      instances,
      volumes,
      snapshots,
      securityGroups,
      vpcs,
      subnets,
      routeTables,
      internetGateways,
      elasticIps,
      buckets: data.buckets,
      keyPairs: data.keyPairs,
      showEmpty: () => {
        setMode("empty");
        setData(createEmptyAccount());
      },
      showSample: () => {
        setMode("sample");
        setData(createSampleAccount());
      },
      renameInstance: (id, name) => {
        setData((prev) => ({
          ...prev,
          instances: prev.instances.map((item) => (item.id === id ? { ...item, name } : item)),
        }));
      },
      setInstanceState: (ids, state) => {
        setData((prev) => ({
          ...prev,
          instances: prev.instances.map((item) =>
            ids.includes(item.id)
              ? {
                  ...item,
                  state,
                  status: state === "running" ? "ok" : "none",
                  checksPassed: state === "running" ? 3 : 0,
                }
              : item,
          ),
        }));
      },
      terminateInstances: (ids) => {
        setData((prev) => ({
          ...prev,
          instances: prev.instances.filter((item) => !ids.includes(item.id)),
          volumes: prev.volumes.filter((item) => !ids.includes(item.attachedTo)),
          elasticIps: prev.elasticIps.map((item) => (ids.includes(item.instanceId) ? { ...item, instanceId: "" } : item)),
        }));
      },
      launch: (draft) => {
        const count = Math.min(20, Math.max(1, Math.round(draft.count) || 1));
        const zone = zonesFor(region)[0] ?? "a";
        const image = machineImages.find((item) => item.id === draft.imageId);
        setData((prev) => {
          const next: Dataset = {
            ...prev,
            instances: [...prev.instances],
            volumes: [...prev.volumes],
            snapshots: [...prev.snapshots],
            securityGroups: [...prev.securityGroups],
            vpcs: [...prev.vpcs],
            buckets: [...prev.buckets],
            keyPairs: [...prev.keyPairs],
          };
          let groupId = draft.securityGroupId || DEFAULT_SG_ID;
          if (draft.firewall === "create") {
            groupId = newId("sg");
            const slug = draft.name || "launch";
            next.securityGroups.push({
              id: groupId,
              name: `${slug}-sg`,
              groupName: `${slug}-sg`,
              vpcId: draft.vpcId,
              description: "Created from the launch form",
              owner: ACCOUNT.id,
              region,
              rules: [
                ...(draft.allowSsh
                  ? [{ direction: "in" as const, protocol: "TCP", port: "22", source: draft.sshCidr }]
                  : []),
                ...(draft.allowHttps
                  ? [{ direction: "in" as const, protocol: "TCP", port: "443", source: "0.0.0.0/0" }]
                  : []),
                ...(draft.allowHttp
                  ? [{ direction: "in" as const, protocol: "TCP", port: "80", source: "0.0.0.0/0" }]
                  : []),
                { direction: "out", protocol: "All", port: "All", source: "0.0.0.0/0" },
              ],
            });
          }
          const spec = volumeTypeOptions.find((item) => item.id === draft.volumeType) ?? volumeTypeOptions[0];
          for (let index = 0; index < count; index += 1) {
            const id = newId("cmp");
            const name = draft.name ? (count > 1 ? `${draft.name}-${index + 1}` : draft.name) : "";
            next.instances.push({
              id,
              name,
              state: "running",
              type: draft.instanceType,
              status: "ok",
              checksPassed: 3,
              checksTotal: 3,
              availabilityZone: zone,
              publicDns: draft.publicIp ? `${id}.north.example.net` : "",
              publicIpv4: draft.publicIp ? `203.0.113.${(index + 20) % 200}` : "",
              privateIpv4: "",
              elasticIp: "",
              ipv6: "",
              region,
              vpcId: draft.vpcId,
              securityGroupIds: groupId ? [groupId] : [],
              keyPair: draft.keyPair,
              imageId: image?.id ?? draft.imageId,
              launchedAt: "Just now",
            });
            next.volumes.push({
              id: newId("blk"),
              name: name ? `${name}-root` : "",
              volumeType: spec.id,
              sizeGiB: draft.volumeGiB,
              iops: spec.iops,
              throughput: spec.throughput,
              owner: ACCOUNT.id,
              snapshotId: "",
              sourceVolumeId: "",
              created: "Just now",
              availabilityZone: zone,
              region,
              attachedTo: id,
            });
          }
          return next;
        });
      },
      createVolume: (input) => {
        const spec = volumeTypeOptions.find((item) => item.id === input.volumeType) ?? volumeTypeOptions[0];
        setData((prev) => ({
          ...prev,
          volumes: [
            {
              id: newId("blk"),
              name: input.name,
              volumeType: spec.id,
              sizeGiB: input.sizeGiB,
              iops: spec.iops,
              throughput: spec.throughput,
              owner: ACCOUNT.id,
              snapshotId: "",
              sourceVolumeId: "",
              created: "Just now",
              availabilityZone: input.availabilityZone,
              region,
              attachedTo: "",
            },
            ...prev.volumes,
          ],
        }));
      },
      deleteVolumes: (ids) => {
        setData((prev) => ({
          ...prev,
          volumes: prev.volumes.filter((item) => !ids.includes(item.id)),
        }));
      },
      modifyVolume: (id, input) => {
        const spec = volumeTypeOptions.find((item) => item.id === input.volumeType);
        if (!spec) return;
        setData((prev) => ({
          ...prev,
          volumes: prev.volumes.map((item) =>
            item.id === id
              ? { ...item, volumeType: spec.id, sizeGiB: Math.max(item.sizeGiB, input.sizeGiB), iops: spec.iops, throughput: spec.throughput }
              : item,
          ),
        }));
      },
      createSnapshot: (input) => {
        setData((prev) => {
          const volume = prev.volumes.find((item) => item.id === input.volumeId);
          if (!volume) return prev;
          const id = newId("snap");
          return {
            ...prev,
            volumes: prev.volumes.map((item) => (item.id === volume.id ? { ...item, snapshotId: id } : item)),
            snapshots: [
              {
                id,
                name: input.name,
                volumeId: volume.id,
                sizeGiB: volume.sizeGiB,
                description: input.description,
                state: "completed",
                started: "Just now",
                owner: ACCOUNT.id,
                region: volume.region,
              },
              ...prev.snapshots,
            ],
          };
        });
      },
      deleteSnapshots: (ids) => {
        setData((prev) => ({
          ...prev,
          snapshots: prev.snapshots.filter((item) => !ids.includes(item.id)),
          volumes: prev.volumes.map((item) => (ids.includes(item.snapshotId) ? { ...item, snapshotId: "" } : item)),
        }));
      },
      createSecurityGroup: (input) => {
        setData((prev) => ({
          ...prev,
          securityGroups: [
            {
              id: newId("sg"),
              name: input.name,
              groupName: input.groupName || input.name || "unnamed",
              vpcId: input.vpcId,
              description: input.description,
              owner: ACCOUNT.id,
              region,
              rules: [
                ...(input.allowSsh
                  ? [{ direction: "in" as const, protocol: "TCP", port: "22", source: "0.0.0.0/0" }]
                  : []),
                { direction: "out", protocol: "All", port: "All", source: "0.0.0.0/0" },
              ],
            },
            ...prev.securityGroups,
          ],
        }));
      },
      deleteSecurityGroups: (ids) => {
        setData((prev) => ({
          ...prev,
          securityGroups: prev.securityGroups.filter((item) => !ids.includes(item.id)),
        }));
      },
      createVpc: (input) => {
        setData((prev) => ({
          ...prev,
          vpcs: [
            {
              id: newId("vpc"),
              name: input.name,
              state: "available",
              encryption: "—",
              encryptionControl: "—",
              blockPublicAccess: "off",
              ipv4Cidr: input.ipv4Cidr,
              ipv6Cidr: "",
              region,
            },
            ...prev.vpcs,
          ],
        }));
      },
      deleteVpcs: (ids) => {
        setData((prev) => ({
          ...prev,
          vpcs: prev.vpcs.filter((item) => !ids.includes(item.id)),
          subnets: prev.subnets.filter((item) => !ids.includes(item.vpcId)),
          routeTables: prev.routeTables.filter((item) => !ids.includes(item.vpcId)),
          internetGateways: prev.internetGateways.map((item) =>
            ids.includes(item.vpcId) ? { ...item, state: "detached", vpcId: "" } : item,
          ),
        }));
      },
      createSubnet: (input) => {
        const error = validateSubnetCidr(input.ipv4Cidr, data.vpcs.find((item) => item.id === input.vpcId));
        if (error) return error;
        const prefix = Number(input.ipv4Cidr.split("/")[1]);
        setData((prev) => {
          const main = prev.routeTables.find((item) => item.vpcId === input.vpcId && item.main);
          const id = newId("subnet");
          return {
            ...prev,
            subnets: [
              {
                id,
                name: input.name,
                vpcId: input.vpcId,
                state: "available",
                ipv4Cidr: input.ipv4Cidr,
                availableIps: 2 ** (32 - prefix) - 5,
                availabilityZone: input.availabilityZone,
                routeTableId: main?.id ?? "",
                autoAssignPublicIp: false,
                region,
              },
              ...prev.subnets,
            ],
            routeTables: prev.routeTables.map((item) =>
              main && item.id === main.id ? { ...item, subnetIds: [...item.subnetIds, id] } : item,
            ),
          };
        });
        return null;
      },
      deleteSubnets: (ids) => {
        setData((prev) => ({
          ...prev,
          subnets: prev.subnets.filter((item) => !ids.includes(item.id)),
          routeTables: prev.routeTables.map((item) => ({
            ...item,
            subnetIds: item.subnetIds.filter((subnetId) => !ids.includes(subnetId)),
          })),
        }));
      },
      createRouteTable: (input) => {
        const vpc = data.vpcs.find((item) => item.id === input.vpcId);
        if (!vpc) return;
        setData((prev) => ({
          ...prev,
          routeTables: [
            {
              id: newId("rtb"),
              name: input.name,
              vpcId: vpc.id,
              main: false,
              subnetIds: [],
              routes: [{ destination: vpc.ipv4Cidr, target: "local", status: "active" }],
              region,
            },
            ...prev.routeTables,
          ],
        }));
      },
      deleteRouteTables: (ids) => {
        setData((prev) => ({
          ...prev,
          routeTables: prev.routeTables.filter((item) => item.main || !ids.includes(item.id)),
          subnets: prev.subnets.map((item) => {
            const gone = prev.routeTables.some((table) => !table.main && ids.includes(table.id) && table.id === item.routeTableId);
            if (!gone) return item;
            const main = prev.routeTables.find((table) => table.vpcId === item.vpcId && table.main);
            return { ...item, routeTableId: main?.id ?? "" };
          }),
        }));
      },
      addRoute: (tableId, destination, target) => {
        if (!isCidr(destination)) return "Destination must be an IPv4 CIDR block such as 0.0.0.0/0.";
        const table = data.routeTables.find((item) => item.id === tableId);
        if (!table) return "Route table not found.";
        if (table.routes.some((item) => item.destination === destination)) return "A route for that destination already exists.";
        if (!target) return "Choose a target.";
        setData((prev) => ({
          ...prev,
          routeTables: prev.routeTables.map((item) =>
            item.id === tableId ? { ...item, routes: [...item.routes, { destination, target, status: "active" }] } : item,
          ),
        }));
        return null;
      },
      associateSubnet: (tableId, subnetId) => {
        setData((prev) => ({
          ...prev,
          subnets: prev.subnets.map((item) => (item.id === subnetId ? { ...item, routeTableId: tableId } : item)),
          routeTables: prev.routeTables.map((item) => ({
            ...item,
            subnetIds:
              item.id === tableId
                ? [...item.subnetIds.filter((id) => id !== subnetId), subnetId]
                : item.subnetIds.filter((id) => id !== subnetId),
          })),
        }));
      },
      createInternetGateway: (name) => {
        setData((prev) => ({
          ...prev,
          internetGateways: [
            { id: newId("igw"), name, state: "detached", vpcId: "", region },
            ...prev.internetGateways,
          ],
        }));
      },
      attachInternetGateway: (id, vpcId) => {
        if (data.internetGateways.some((item) => item.vpcId === vpcId)) {
          return "That VPC already has an internet gateway attached.";
        }
        setData((prev) => ({
          ...prev,
          internetGateways: prev.internetGateways.map((item) =>
            item.id === id ? { ...item, state: "attached", vpcId } : item,
          ),
        }));
        return null;
      },
      detachInternetGateway: (id) => {
        setData((prev) => ({
          ...prev,
          internetGateways: prev.internetGateways.map((item) =>
            item.id === id ? { ...item, state: "detached", vpcId: "" } : item,
          ),
          routeTables: prev.routeTables.map((table) => ({
            ...table,
            routes: table.routes.map((route) => (route.target === id ? { ...route, status: "blackhole" } : route)),
          })),
        }));
      },
      deleteInternetGateways: (ids) => {
        setData((prev) => ({
          ...prev,
          internetGateways: prev.internetGateways.filter((item) => item.state === "attached" || !ids.includes(item.id)),
        }));
      },
      allocateElasticIp: (name) => {
        setData((prev) => ({
          ...prev,
          elasticIps: [
            {
              allocationId: newId("eipalloc"),
              name,
              address: nextTestAddress(prev.elasticIps),
              instanceId: "",
              privateIp: "",
              region,
            },
            ...prev.elasticIps,
          ],
        }));
      },
      associateElasticIp: (allocationId, instanceId) => {
        setData((prev) => {
          const eip = prev.elasticIps.find((item) => item.allocationId === allocationId);
          if (!eip) return prev;
          return {
            ...prev,
            elasticIps: prev.elasticIps.map((item) =>
              item.allocationId === allocationId ? { ...item, instanceId } : item,
            ),
            instances: prev.instances.map((item) =>
              item.id === instanceId ? { ...item, elasticIp: eip.address, publicIpv4: eip.address } : item,
            ),
          };
        });
      },
      disassociateElasticIp: (allocationId) => {
        setData((prev) => {
          const eip = prev.elasticIps.find((item) => item.allocationId === allocationId);
          if (!eip) return prev;
          return {
            ...prev,
            elasticIps: prev.elasticIps.map((item) =>
              item.allocationId === allocationId ? { ...item, instanceId: "" } : item,
            ),
            instances: prev.instances.map((item) =>
              item.id === eip.instanceId ? { ...item, elasticIp: "", publicIpv4: "" } : item,
            ),
          };
        });
      },
      releaseElasticIps: (ids) => {
        setData((prev) => ({
          ...prev,
          elasticIps: prev.elasticIps.filter((item) => item.instanceId || !ids.includes(item.allocationId)),
        }));
      },
      createBucket: (input) => {
        const name = input.name.trim();
        if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name)) {
          return "Use 3–63 characters: lowercase letters, numbers, and hyphens.";
        }
        if (data.buckets.some((item) => item.name === name)) return "A bucket with that name already exists.";
        setData((prev) => ({
          ...prev,
          buckets: [
            ...prev.buckets,
            { name, region, created: "Just now", kind: input.kind },
          ],
        }));
        return null;
      },
      deleteBuckets: (names) => {
        setData((prev) => ({
          ...prev,
          buckets: prev.buckets.filter((item) => !names.includes(item.name)),
        }));
      },
      addKeyPair: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setData((prev) => ({
          ...prev,
          keyPairs: prev.keyPairs.some((item) => item.name === trimmed)
            ? prev.keyPairs
            : [...prev.keyPairs, { name: trimmed, fingerprint: `SHA256:${newId("fp").slice(3, 15)}` }],
        }));
      },
    };
  }, [data, density, mode, region]);

  return <ConsoleContext.Provider value={api}>{children}</ConsoleContext.Provider>;
}

export function useConsole() {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error("useConsole must be used inside ConsoleProvider");
  return value;
}
