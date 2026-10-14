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
  HOME_REGION,
  REGIONS,
} from "@/lib/console-data";
import type {
  Bucket,
  BucketObject,
  Dataset,
  Instance,
  InternetGateway,
  RouteTable,
  SecurityGroup,
  SecurityGroupRule,
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
  objects: BucketObject[];
  keyPairs: Dataset["keyPairs"];
  createSnapshot: (input: { volumeId: string; name: string; description: string }) => void;
  deleteSnapshots: (ids: string[]) => void;
  createSecurityGroup: (input: {
    name: string;
    groupName: string;
    description: string;
    vpcId: string;
    inbound: SecurityGroupRule[];
    outbound: SecurityGroupRule[];
  }) => string;
  updateSecurityGroupRules: (id: string, direction: SecurityGroupRule["direction"], rules: SecurityGroupRule[]) => void;
  deleteSecurityGroups: (ids: string[]) => void;
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
  createBucket: (input: { name: string; kind: Bucket["kind"]; versioning: boolean; blockPublicAccess: boolean }) => string | null;
  deleteBuckets: (names: string[]) => void;
  emptyBucket: (name: string) => void;
  addObjects: (bucket: string, items: { key: string; sizeBytes: number }[]) => void;
  createFolder: (bucket: string, key: string) => void;
  deleteObjects: (bucket: string, keys: string[]) => void;
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
      objects: data.objects,
      keyPairs: data.keyPairs,
      showEmpty: () => {
        setMode("empty");
        setData(createEmptyAccount());
      },
      showSample: () => {
        setMode("sample");
        setData(createSampleAccount());
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
        const id = newId("sg");
        setData((prev) => ({
          ...prev,
          securityGroups: [
            {
              id,
              name: input.name,
              groupName: input.groupName || input.name || "unnamed",
              vpcId: input.vpcId,
              description: input.description,
              owner: ACCOUNT.id,
              region,
              rules: [
                ...input.inbound.map((rule) => ({ ...rule, direction: "in" as const })),
                ...input.outbound.map((rule) => ({ ...rule, direction: "out" as const })),
              ],
            },
            ...prev.securityGroups,
          ],
        }));
        return id;
      },
      updateSecurityGroupRules: (id, direction, rules) => {
        setData((prev) => ({
          ...prev,
          securityGroups: prev.securityGroups.map((item) =>
            item.id === id
              ? {
                  ...item,
                  rules: [...item.rules.filter((rule) => rule.direction !== direction), ...rules.map((rule) => ({ ...rule, direction }))],
                }
              : item,
          ),
        }));
      },
      deleteSecurityGroups: (ids) => {
        setData((prev) => ({
          ...prev,
          securityGroups: prev.securityGroups.filter((item) => !ids.includes(item.id)),
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
            { name, region, created: "Just now", kind: input.kind, versioning: input.versioning, blockPublicAccess: input.blockPublicAccess },
          ],
        }));
        return null;
      },
      deleteBuckets: (names) => {
        setData((prev) => ({
          ...prev,
          buckets: prev.buckets.filter((item) => !names.includes(item.name)),
          objects: prev.objects.filter((item) => !names.includes(item.bucket)),
        }));
      },
      emptyBucket: (name) => {
        setData((prev) => ({ ...prev, objects: prev.objects.filter((item) => item.bucket !== name) }));
      },
      addObjects: (bucket, items) => {
        setData((prev) => {
          const keys = items.map((item) => item.key);
          const added: BucketObject[] = items.map((item) => ({
            bucket,
            key: item.key,
            sizeBytes: item.sizeBytes,
            modified: "Just now",
            storageClass: "Standard",
          }));
          return {
            ...prev,
            objects: [...prev.objects.filter((item) => item.bucket !== bucket || !keys.includes(item.key)), ...added],
          };
        });
      },
      createFolder: (bucket, key) => {
        setData((prev) =>
          prev.objects.some((item) => item.bucket === bucket && item.key === key)
            ? prev
            : { ...prev, objects: [...prev.objects, { bucket, key, sizeBytes: 0, modified: "", storageClass: "" }] },
        );
      },
      deleteObjects: (bucket, keys) => {
        // A folder key removes everything under it.
        setData((prev) => ({
          ...prev,
          objects: prev.objects.filter(
            (item) => item.bucket !== bucket || !keys.some((key) => (key.endsWith("/") ? item.key.startsWith(key) : item.key === key)),
          ),
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
