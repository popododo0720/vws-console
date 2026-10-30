import { describe, expect, it } from "vitest";
import { ingressPermissions } from "./sg-permissions";
import { makeRule } from "@/lib/security-group-rules";

describe("ingressPermissions", () => {
  it("keeps one IpPermission per rule, in order", () => {
    const { permissions, error } = ingressPermissions([
      makeRule("in", "TCP", "443", "0.0.0.0/0"),
      makeRule("in", "TCP", "22", "10.0.0.0/8"),
    ]);
    expect(error).toBeNull();
    expect(permissions.map((p) => [p.fromPort, p.ipRanges?.[0].cidrIp])).toEqual([
      [443, "0.0.0.0/0"],
      [22, "10.0.0.0/8"],
    ]);
  });

  it("names the first bad rule and sends nothing", () => {
    expect(
      ingressPermissions([makeRule("in", "TCP", "22", "0.0.0.0/0"), makeRule("in", "TCP", "x", "0.0.0.0/0")]),
    ).toEqual({ permissions: [], error: "Rule 2: Port range x is not a port or a range." });
  });

  it("sends nothing for no rules", () => {
    expect(ingressPermissions([])).toEqual({ permissions: [], error: null });
  });
});
