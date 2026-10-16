"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createEmptyAccount, createSampleAccount, HOME_REGION, REGIONS } from "@/lib/console-data";
import type {
  Bucket,
  BucketObject,
  Dataset,
  Instance,
  InternetGateway,
  RouteTable,
  Subnet,
  Volume,
  Vpc,
} from "@/types/console";
import type { Identity } from "@/lib/vws-api/adapter";

type Mode = "empty" | "sample";
type Density = "comfortable" | "compact";

type ConsoleApi = {
  /** The signed-in user name and account ID, "—" where unknown. */
  account: { name: string; id: string };
  signIn: boolean;
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
  vpcs: Vpc[];
  subnets: Subnet[];
  routeTables: RouteTable[];
  internetGateways: InternetGateway[];
  buckets: Bucket[];
  objects: BucketObject[];
  createRouteTable: (input: { name: string; vpcId: string }) => void;
  deleteRouteTables: (ids: string[]) => void;
  addRoute: (tableId: string, destination: string, target: string) => string | null;
  associateSubnet: (tableId: string, subnetId: string) => void;
  createInternetGateway: (name: string) => void;
  attachInternetGateway: (id: string, vpcId: string) => string | null;
  detachInternetGateway: (id: string) => void;
  deleteInternetGateways: (ids: string[]) => void;
  createBucket: (input: {
    name: string;
    kind: Bucket["kind"];
    versioning: boolean;
    blockPublicAccess: boolean;
  }) => string | null;
  deleteBuckets: (names: string[]) => void;
  emptyBucket: (name: string) => void;
  addObjects: (bucket: string, items: { key: string; sizeBytes: number }[]) => void;
  createFolder: (bucket: string, key: string) => void;
  deleteObjects: (bucket: string, keys: string[]) => void;
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

const UNKNOWN: Identity = { userName: "—", accountId: "—" };

export function ConsoleProvider({
  children,
  identity = UNKNOWN,
  signIn = false,
}: {
  children: ReactNode;
  identity?: Identity;
  /** True when IAM is on and users sign in; the account menu then offers Sign out. */
  signIn?: boolean;
}) {
  const [region, setRegion] = useState<string>(HOME_REGION);
  const [mode, setMode] = useState<Mode>("empty");
  const [data, setData] = useState<Dataset>(() => createEmptyAccount());
  const [density, setDensity] = useState<Density>("comfortable");

  const api = useMemo<ConsoleApi>(() => {
    const instances = data.instances.filter((item) => item.region === region);
    const volumes = data.volumes.filter((item) => item.region === region);
    const vpcs = data.vpcs.filter((item) => item.region === region);
    const subnets = data.subnets.filter((item) => item.region === region);
    const routeTables = data.routeTables.filter((item) => item.region === region);
    const internetGateways = data.internetGateways.filter((item) => item.region === region);

    return {
      account: { name: identity.userName, id: identity.accountId },
      signIn,
      regions: REGIONS,
      region,
      setRegion,
      mode,
      density,
      setDensity,
      instances,
      volumes,
      vpcs,
      subnets,
      routeTables,
      internetGateways,
      buckets: data.buckets,
      objects: data.objects,
      showEmpty: () => {
        setMode("empty");
        setData(createEmptyAccount());
      },
      showSample: () => {
        setMode("sample");
        setData(createSampleAccount());
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
            const gone = prev.routeTables.some(
              (table) => !table.main && ids.includes(table.id) && table.id === item.routeTableId,
            );
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
        if (table.routes.some((item) => item.destination === destination))
          return "A route for that destination already exists.";
        if (!target) return "Choose a target.";
        setData((prev) => ({
          ...prev,
          routeTables: prev.routeTables.map((item) =>
            item.id === tableId
              ? { ...item, routes: [...item.routes, { destination, target, status: "active" }] }
              : item,
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
            {
              name,
              region,
              created: "Just now",
              kind: input.kind,
              versioning: input.versioning,
              blockPublicAccess: input.blockPublicAccess,
            },
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
            (item) =>
              item.bucket !== bucket ||
              !keys.some((key) => (key.endsWith("/") ? item.key.startsWith(key) : item.key === key)),
          ),
        }));
      },
    };
  }, [data, density, identity.accountId, identity.userName, mode, region, signIn]);

  return <ConsoleContext.Provider value={api}>{children}</ConsoleContext.Provider>;
}

export function useConsole() {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error("useConsole must be used inside ConsoleProvider");
  return value;
}
