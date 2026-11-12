"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { createEmptyAccount, createSampleAccount } from "@/lib/console-data";
import type { Dataset, Instance, InternetGateway, NatGateway, RouteTable, Subnet, Volume, Vpc } from "@/types/console";
import { ALL_REGIONS, mutationCapability, pickRegion } from "@/lib/vws-api/adapter";
import type { AccountBucket, ApiError, ApiResult, Identity, Region, RegionCapabilities } from "@/lib/vws-api/adapter";

type Mode = "empty" | "sample";

/** A success message for the page named by `key`, shown once after a redirect as the AWS console flashbar does. */
export type ConsoleFlash = { key: string; message: string };
type Density = "comfortable" | "compact";

type ConsoleApi = {
  /** The signed-in user name and account ID, "—" where unknown. */
  account: { name: string; id: string };
  signIn: boolean;
  /** The regions console-api lists. Empty with no list; `regionsError` says why when the read failed. */
  regions: readonly Region[];
  regionsError: ApiError | null;
  /** The selected region name, "all" for All regions, or "" when no region is listed. */
  region: string;
  /** Why the selected region's capability document could not be read; every action is refused while it is set. */
  capabilitiesError: ApiError | null;
  /** Why the selected region refuses `action` ("ec2:RunInstances"), or null when its document serves it. */
  denied: (action: string) => string | null;
  /** The reason of a `partial` action whose reasonCode is `code`, for the one form input that code turns off. */
  limited: (action: string, code: string) => string | null;
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
  natGateways: NatGateway[];
  /** The browser-only resources of every region, for screens that count across regions. */
  dataset: Dataset;
  accountBuckets: readonly AccountBucket[];
  /** The vws:Admin* actions console-api grants the signed-in caller; the operator menu needs one of them. */
  adminActions: readonly string[];
  flash: ConsoleFlash | null;
  showFlash: (flash: ConsoleFlash) => void;
  clearFlash: () => void;
  createRouteTable: (input: { name: string; vpcId: string }) => void;
  deleteRouteTables: (ids: string[]) => void;
  addRoute: (tableId: string, destination: string, target: string) => string | null;
  associateSubnet: (tableId: string, subnetId: string) => void;
  createInternetGateway: (name: string) => void;
  attachInternetGateway: (id: string, vpcId: string) => string | null;
  detachInternetGateway: (id: string) => void;
  deleteInternetGateways: (ids: string[]) => void;
  /** Returns an error message, or null when the gateway was created. */
  createNatGateway: (input: {
    name: string;
    subnetId: string;
    connectivity: NatGateway["connectivity"];
  }) => string | null;
  deleteNatGateways: (ids: string[]) => void;
};

const NAME_MAX = 256;

/** A host address inside the subnet's block; the sample data never models which addresses are taken. */
function hostAddress(cidr: string, host: number) {
  const octets = cidr.split("/")[0].split(".");
  return `${octets.slice(0, 3).join(".")}.${host}`;
}

function randomHost() {
  return 10 + (crypto.getRandomValues(new Uint8Array(1))[0] % 240);
}

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

/** The reasons for a refused action when no capability document gives one. Without a document nothing is supported. */
const NO_DOCUMENT = "Choose a region to use this action.";
const UNREAD = "The capabilities of this region could not be read.";
const NO_REASON = "This region does not support this action.";

const UNKNOWN: Identity = { userName: "—", accountId: "—" };
const NO_REGIONS: readonly Region[] = [];

export function ConsoleProvider({
  children,
  identity = UNKNOWN,
  signIn = false,
  accountBuckets = [],
  adminActions = [],
  regions: listing = null,
  capabilities: read = null,
}: {
  children: ReactNode;
  identity?: Identity;
  signIn?: boolean;
  accountBuckets?: readonly AccountBucket[];
  adminActions?: readonly string[];
  regions?: ApiResult<Region[]> | null;
  capabilities?: ApiResult<RegionCapabilities | null> | null;
}) {
  const capabilities = read?.ok ? read.value : null;
  const capabilitiesError = read && !read.ok ? read.error : null;
  const regions = listing?.ok ? listing.value : NO_REGIONS;
  const regionsError = listing && !listing.ok ? listing.error : null;
  // Read from the URL like the server does, so the menu never names a region the requests did not go to.
  const region = pickRegion(regions, useSearchParams().get("region")) ?? "";
  /** The browser-only resources live in the first listed region; every other region starts without any. */
  const home = regions[0]?.name ?? "";
  const [mode, setMode] = useState<Mode>("empty");
  const [data, setData] = useState<Dataset>(() => createEmptyAccount(home));
  // The list can arrive after the first render (a failed read, then Try again): what was seeded follows it.
  const [seeded, setSeeded] = useState(home);
  if (seeded !== home) {
    const move = <T extends { region: string }>(items: T[]) =>
      items.map((item) => (item.region === seeded ? { ...item, region: home } : item));
    setSeeded(home);
    setData((prev) => ({
      ...prev,
      vpcs: move(prev.vpcs),
      subnets: move(prev.subnets),
      routeTables: move(prev.routeTables),
      internetGateways: move(prev.internetGateways),
      natGateways: move(prev.natGateways),
    }));
  }
  const [density, setDensity] = useState<Density>("comfortable");
  const [flash, setFlash] = useState<ConsoleFlash | null>(null);

  const api = useMemo<ConsoleApi>(() => {
    const here = <T extends { region: string }>(items: T[]) =>
      region === ALL_REGIONS ? items : items.filter((item) => item.region === region);
    const instances = here(data.instances);
    const volumes = here(data.volumes);
    const vpcs = here(data.vpcs);
    const subnets = here(data.subnets);
    const routeTables = here(data.routeTables);
    const internetGateways = here(data.internetGateways);
    const natGateways = here(data.natGateways);
    const target = region === ALL_REGIONS ? home : region;

    return {
      account: { name: identity.userName, id: identity.accountId },
      signIn,
      regions,
      regionsError,
      region,
      capabilitiesError,
      denied: (action) => {
        if (!capabilities) return capabilitiesError ? UNREAD : NO_DOCUMENT;
        const { state, reason } = mutationCapability(capabilities, action);
        return state === "supported" || state === "partial" ? null : reason || NO_REASON;
      },
      limited: (action, code) => {
        const got = capabilities && mutationCapability(capabilities, action);
        return got && got.state === "partial" && got.reasonCode === code ? got.reason : null;
      },
      mode,
      density,
      setDensity,
      instances,
      volumes,
      vpcs,
      subnets,
      routeTables,
      internetGateways,
      natGateways,
      dataset: data,
      accountBuckets,
      adminActions,
      flash,
      showFlash: setFlash,
      clearFlash: () => setFlash(null),
      showEmpty: () => {
        setMode("empty");
        setData(createEmptyAccount(home));
      },
      showSample: () => {
        setMode("sample");
        setData(createSampleAccount(home));
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
              region: target,
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
            { id: newId("igw"), name, state: "detached", vpcId: "", region: target },
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
      createNatGateway: ({ name, subnetId, connectivity }) => {
        if (name.length > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer.`;
        const subnet = subnets.find((item) => item.id === subnetId);
        if (!subnet) return "Choose a subnet in this region.";
        const gateway: NatGateway = {
          id: newId("nat"),
          name,
          connectivity,
          state: "available",
          stateMessage: "",
          availabilityMode: "zonal",
          routeTableId: subnet.routeTableId,
          publicIp: connectivity === "public" ? `203.0.113.${randomHost()}` : "",
          privateIp: hostAddress(subnet.ipv4Cidr, randomHost()),
          networkInterfaceId: newId("eni"),
          vpcId: subnet.vpcId,
          subnetId: subnet.id,
          created: new Date().toISOString(),
          deleted: "",
          region: target,
        };
        setData((prev) => ({ ...prev, natGateways: [gateway, ...prev.natGateways] }));
        return null;
      },
      deleteNatGateways: (ids) => {
        const deleted = new Date().toISOString();
        setData((prev) => ({
          ...prev,
          natGateways: prev.natGateways.map((item) =>
            item.state === "available" && ids.includes(item.id) ? { ...item, state: "deleted", deleted } : item,
          ),
        }));
      },
    };
  }, [
    accountBuckets,
    adminActions,
    capabilities,
    capabilitiesError,
    data,
    density,
    flash,
    home,
    identity.accountId,
    identity.userName,
    mode,
    region,
    regions,
    regionsError,
    signIn,
  ]);

  return <ConsoleContext.Provider value={api}>{children}</ConsoleContext.Provider>;
}

/** Looks up why the selected region refuses an action; null for a served action or a control that starts none. */
export function useDenied(): (action: string | undefined) => string | null {
  const api = useContext(ConsoleContext);
  return (action) => {
    if (action === undefined) return null;
    if (!api) throw new Error("useDenied must be used inside ConsoleProvider");
    return api.denied(action);
  };
}

export function useConsole() {
  const value = useContext(ConsoleContext);
  if (!value) throw new Error("useConsole must be used inside ConsoleProvider");
  return value;
}
