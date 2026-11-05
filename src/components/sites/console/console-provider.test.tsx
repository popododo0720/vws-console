import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ConsoleProvider, useConsole } from "@/components/sites/console/console-provider";

const wrapper = ({ children }: { children: ReactNode }) => <ConsoleProvider>{children}</ConsoleProvider>;

function renderSample() {
  const hook = renderHook(() => useConsole(), { wrapper });
  act(() => hook.result.current.showSample());
  return hook;
}

describe("NAT gateway actions", () => {
  it("creates a public gateway in a subnet of the current region with a documentation-range address", () => {
    const { result } = renderSample();
    const subnet = result.current.subnets[0];
    let error: string | null = "unset";
    act(() => {
      error = result.current.createNatGateway({ name: "edge", subnetId: subnet.id, connectivity: "public" });
    });
    expect(error).toBeNull();
    const created = result.current.natGateways[0];
    expect(created).toMatchObject({
      name: "edge",
      connectivity: "public",
      state: "available",
      subnetId: subnet.id,
      vpcId: subnet.vpcId,
      routeTableId: subnet.routeTableId,
      deleted: "",
    });
    expect(created.publicIp).toMatch(/^203\.0\.113\.\d{1,3}$/);
    expect(created.privateIp.startsWith(subnet.ipv4Cidr.split(".").slice(0, 3).join("."))).toBe(true);
  });

  it("gives a private gateway no public address", () => {
    const { result } = renderSample();
    act(() => {
      result.current.createNatGateway({
        name: "",
        subnetId: result.current.subnets[0].id,
        connectivity: "private",
      });
    });
    expect(result.current.natGateways[0].publicIp).toBe("");
  });

  it("rejects an unknown subnet and a name over 256 characters, and adds nothing", () => {
    const { result } = renderSample();
    const before = result.current.natGateways.length;
    const subnetId = result.current.subnets[0].id;
    let unknown: string | null = null;
    let long: string | null = null;
    act(() => {
      unknown = result.current.createNatGateway({ name: "x", subnetId: "subnet-missing", connectivity: "public" });
      long = result.current.createNatGateway({ name: "n".repeat(257), subnetId, connectivity: "public" });
    });
    expect(unknown).toMatch(/subnet/i);
    expect(long).toMatch(/256/);
    expect(result.current.natGateways).toHaveLength(before);
    let boundary: string | null = "unset";
    act(() => {
      boundary = result.current.createNatGateway({ name: "n".repeat(256), subnetId, connectivity: "public" });
    });
    expect(boundary).toBeNull();
  });

  it("rejects a subnet that exists only in another region", () => {
    const { result } = renderSample();
    const subnetId = result.current.subnets[0].id;
    act(() => result.current.setRegion("US East"));
    let error: string | null = null;
    act(() => {
      error = result.current.createNatGateway({ name: "x", subnetId, connectivity: "public" });
    });
    expect(error).toMatch(/subnet/i);
    expect(result.current.natGateways).toHaveLength(0);
  });

  it("keeps a deleted gateway listed with the delete time, and ignores a second delete", () => {
    const { result } = renderSample();
    const id = result.current.natGateways[0].id;
    act(() => result.current.deleteNatGateways([id]));
    const first = result.current.natGateways.find((item) => item.id === id);
    expect(first?.state).toBe("deleted");
    expect(Number.isNaN(Date.parse(first?.deleted ?? ""))).toBe(false);
    act(() => result.current.deleteNatGateways([id]));
    expect(result.current.natGateways.find((item) => item.id === id)).toEqual(first);
  });

  it("leaves gateways outside the requested ids alone", () => {
    const { result } = renderSample();
    const [first, second] = result.current.natGateways;
    act(() => result.current.deleteNatGateways([first.id, "nat-unknown"]));
    expect(result.current.natGateways.find((item) => item.id === second.id)?.state).toBe("available");
  });

  it("scopes the list to the current region while the dataset keeps every region", () => {
    const { result } = renderSample();
    act(() => result.current.setRegion("US East"));
    expect(result.current.natGateways).toEqual([]);
    expect(result.current.dataset.natGateways.length).toBeGreaterThan(0);
  });
});
