import { describe, expect, it } from "vitest";
import {
  MAX_AUTHORIZE_RULES,
  normalizeCidr,
  opRules,
  permissionLabel,
  pendingPart,
  parseIngressPermission,
  planRuleChanges,
  planRuleOps,
  type RuleChanges,
} from "@/lib/security-group-rules";
import type { IngressPermission } from "@/types/console";

const tcp = (port: number, cidrIp = "0.0.0.0/0"): IngressPermission => ({
  ipProtocol: "tcp",
  fromPort: port,
  toPort: port,
  cidrIp,
});

describe("normalizeCidr", () => {
  it("clears host bits the way console-api stores a network", () => {
    expect(normalizeCidr("10.1.2.3/16")).toBe("10.1.0.0/16");
    expect(normalizeCidr("192.168.7.9/32")).toBe("192.168.7.9/32");
    expect(normalizeCidr("255.255.255.255/0")).toBe("0.0.0.0/0");
  });

  it("refuses anything that is not an IPv4 network", () => {
    for (const bad of ["10.0.0.0", "256.0.0.0/8", "10.0.0.0/33", "::/0", "10.0.0.0/8 ", "<b>/8"]) {
      expect(normalizeCidr(bad)).toBeNull();
    }
  });
});

describe("parseIngressPermission", () => {
  it("accepts the values console-api takes and normalizes the CIDR", () => {
    expect(parseIngressPermission({ ipProtocol: "tcp", fromPort: 80, toPort: 90, cidrIp: "10.0.0.9/8" })).toEqual({
      ipProtocol: "tcp",
      fromPort: 80,
      toPort: 90,
      cidrIp: "10.0.0.0/8",
    });
    expect(parseIngressPermission({ ipProtocol: "-1", fromPort: 5, toPort: 7, cidrIp: "0.0.0.0/0" })).toEqual({
      ipProtocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrIp: "0.0.0.0/0",
    });
  });

  it("refuses malformed and hostile input", () => {
    const bad: unknown[] = [
      null,
      "tcp",
      [],
      { ipProtocol: "gre", fromPort: 0, toPort: 0, cidrIp: "0.0.0.0/0" },
      { ipProtocol: "tcp", fromPort: 90, toPort: 80, cidrIp: "0.0.0.0/0" },
      { ipProtocol: "tcp", fromPort: -1, toPort: 80, cidrIp: "0.0.0.0/0" },
      { ipProtocol: "tcp", fromPort: 1.5, toPort: 80, cidrIp: "0.0.0.0/0" },
      { ipProtocol: "tcp", fromPort: 1, toPort: 70000, cidrIp: "0.0.0.0/0" },
      { ipProtocol: "tcp", fromPort: "22", toPort: 22, cidrIp: "0.0.0.0/0" },
      { ipProtocol: "tcp", fromPort: 22, toPort: 22, cidrIp: "sg-0123456789abcdef0" },
      { ipProtocol: "icmp", fromPort: -1, toPort: -1, cidrIp: "0.0.0.0/0" },
    ];
    for (const input of bad) expect(parseIngressPermission(input)).toBeNull();
  });
});

describe("planRuleChanges", () => {
  it("leaves unchanged rules alone and turns a changed rule into a delete and an add", () => {
    const loaded = [tcp(22), tcp(80)];
    expect(planRuleChanges(loaded, [tcp(22), tcp(8080)])).toEqual({ remove: [tcp(80)], add: [tcp(8080)] });
    expect(planRuleChanges(loaded, [tcp(80), tcp(22)])).toEqual({ remove: [], add: [] });
  });
});

describe("planRuleOps", () => {
  const changes: RuleChanges = { remove: [tcp(80)], add: [tcp(443), tcp(8080)] };

  it("revokes before it authorizes, and adds every new rule in one call", () => {
    expect(planRuleOps([tcp(22), tcp(80)], changes)).toEqual([
      { kind: "revoke", permission: tcp(80) },
      { kind: "authorize", permissions: [tcp(443), tcp(8080)] },
    ]);
  });

  it("sends only the rest on a retry after a partial failure", () => {
    const afterFirstTwo = [tcp(22), tcp(443)];
    expect(planRuleOps(afterFirstTwo, changes)).toEqual([{ kind: "authorize", permissions: [tcp(8080)] }]);
  });

  it("splits additions into calls of at most the rules console-api takes at once", () => {
    const add = Array.from({ length: MAX_AUTHORIZE_RULES + 1 }, (_, port) => tcp(port + 1));
    expect(planRuleOps([], { remove: [], add }).map((op) => opRules(op).length)).toEqual([MAX_AUTHORIZE_RULES, 1]);
  });

  it("sends a rule named twice once, since console-api refuses a duplicate in one call", () => {
    expect(planRuleOps([], { remove: [], add: [tcp(443), tcp(443)] })).toEqual([
      { kind: "authorize", permissions: [tcp(443)] },
    ]);
  });

  it("sends nothing when a double submit already applied the changes", () => {
    expect(planRuleOps([tcp(22), tcp(443), tcp(8080)], changes)).toEqual([]);
  });

  it("keeps a rule another user added since the page loaded", () => {
    const ops = planRuleOps([tcp(22), tcp(80), tcp(3306, "10.0.0.0/8")], changes);
    expect(ops.flatMap(opRules).some((rule) => rule.fromPort === 3306)).toBe(false);
  });

  it("revokes the stored values, so an ICMP type and code match exactly", () => {
    const unreachable = { ipProtocol: "icmp", fromPort: 3, toPort: 4, cidrIp: "0.0.0.0/0" };
    expect(planRuleOps([unreachable], { remove: [unreachable], add: [] })).toEqual([
      { kind: "revoke", permission: unreachable },
    ]);
  });

  it("keeps only the part of an op the group does not show yet", () => {
    expect(pendingPart([tcp(22)], { kind: "revoke", permission: tcp(80) })).toBeNull();
    expect(pendingPart([tcp(22)], { kind: "authorize", permissions: [tcp(22)] })).toBeNull();
    expect(pendingPart([tcp(22)], { kind: "revoke", permission: tcp(22) })).toEqual({
      kind: "revoke",
      permission: tcp(22),
    });
    expect(pendingPart([tcp(22)], { kind: "authorize", permissions: [tcp(22), tcp(443)] })).toEqual({
      kind: "authorize",
      permissions: [tcp(443)],
    });
  });
});

describe("permissionLabel", () => {
  it("shows an ICMP type and code so a preview cannot hide a change to them", () => {
    expect(permissionLabel({ ipProtocol: "icmp", fromPort: 3, toPort: 4, cidrIp: "10.0.0.0/8" })).toBe(
      "ICMP 3-4 from 10.0.0.0/8",
    );
    expect(permissionLabel({ ipProtocol: "icmp", fromPort: 0, toPort: 0, cidrIp: "10.0.0.0/8" })).toBe(
      "ICMP from 10.0.0.0/8",
    );
  });
});
