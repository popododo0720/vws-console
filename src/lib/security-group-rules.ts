import type { IngressPermission, SecurityGroupRule } from "@/types/console";

type RuleTypeId = "all" | "ssh" | "http" | "https" | "tcp" | "udp" | "icmp";

type RuleType = {
  id: RuleTypeId;
  label: string;
  protocol: string;
  port: string;
  portEditable: boolean;
};

export const RULE_TYPES: RuleType[] = [
  { id: "all", label: "All traffic", protocol: "All", port: "All", portEditable: false },
  { id: "ssh", label: "SSH", protocol: "TCP", port: "22", portEditable: false },
  { id: "http", label: "HTTP", protocol: "TCP", port: "80", portEditable: false },
  { id: "https", label: "HTTPS", protocol: "TCP", port: "443", portEditable: false },
  { id: "tcp", label: "Custom TCP", protocol: "TCP", port: "", portEditable: true },
  { id: "udp", label: "Custom UDP", protocol: "UDP", port: "", portEditable: true },
  { id: "icmp", label: "All ICMP - IPv4", protocol: "ICMP", port: "All", portEditable: false },
];

export function ruleTypeOf(rule: Pick<SecurityGroupRule, "protocol" | "port">): RuleType {
  const exact = RULE_TYPES.find(
    (item) => item.protocol === rule.protocol && item.port === rule.port && !item.portEditable,
  );
  if (exact) return exact;
  return RULE_TYPES.find((item) => item.protocol === rule.protocol && item.portEditable) ?? RULE_TYPES[0];
}

export function newRuleId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `sgr-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function makeRule(
  direction: SecurityGroupRule["direction"],
  protocol: string,
  port: string,
  source: string,
  id: string = newRuleId(),
  description = "",
): SecurityGroupRule {
  return { id, direction, protocol, port, source, description, permission: null };
}

const CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

/** The IPv4 network console-api stores for a CIDR, with the host bits cleared, or null when it is not one. */
export function normalizeCidr(value: string): string | null {
  const match = CIDR.exec(value);
  if (!match) return null;
  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some((octet) => octet > 255) || prefix > 32) return null;
  const address = octets.reduce((sum, octet) => sum * 256 + octet, 0);
  const size = 2 ** (32 - prefix);
  const network = address - (address % size);
  return `${[24, 16, 8, 0].map((shift) => Math.floor(network / 2 ** shift) % 256).join(".")}/${prefix}`;
}

function validCidr(value: string): boolean {
  return normalizeCidr(value) !== null;
}

function validPortRange(value: string): boolean {
  const match = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(value);
  if (!match) return false;
  const from = Number(match[1]);
  const to = match[2] === undefined ? from : Number(match[2]);
  return from <= 65535 && to <= 65535 && from <= to;
}

export function validateRule(rule: SecurityGroupRule): string | null {
  const type = ruleTypeOf(rule);
  if (type.portEditable && !validPortRange(rule.port))
    return "Port range must be a port or a range such as 8000-8080 (0-65535).";
  if (!validCidr(rule.source) && !/^sg-[0-9a-f]{8,}$/.test(rule.source))
    return "Source must be a CIDR block such as 10.0.0.0/16 or a security group ID.";
  return null;
}

/** The most rule changes one save accepts, so a server action never loops over an unbounded list. */
export const MAX_RULE_CHANGES = 100;

const PROTOCOLS = new Set(["tcp", "udp", "icmp", "-1"]);

const isPort = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 65535;

/** Parses one rule from untrusted input into the values console-api stores, or null when it cannot take it. */
export function parseIngressPermission(input: unknown): IngressPermission | null {
  if (typeof input !== "object" || input === null) return null;
  const { ipProtocol, fromPort, toPort, cidrIp } = input as Record<string, unknown>;
  if (typeof ipProtocol !== "string" || !PROTOCOLS.has(ipProtocol) || typeof cidrIp !== "string") return null;
  const cidr = normalizeCidr(cidrIp);
  if (!cidr) return null;
  if (ipProtocol === "-1") return { ipProtocol, fromPort: 0, toPort: 0, cidrIp: cidr };
  if (!isPort(fromPort) || !isPort(toPort) || fromPort > toPort) return null;
  return { ipProtocol, fromPort, toPort, cidrIp: cidr };
}

/** Rule identity: console-api has no rule IDs and revokes only a rule with equal values. */
export function ruleKey(permission: IngressPermission): string {
  return `${permission.ipProtocol}/${permission.fromPort}-${permission.toPort}/${permission.cidrIp}`;
}

/** The rules a save removes and adds. A changed rule is one of each, since console-api has no modify call. */
export type RuleChanges = { remove: IngressPermission[]; add: IngressPermission[] };

const uniqueByKey = (rules: IngressPermission[]) => [...new Map(rules.map((rule) => [ruleKey(rule), rule])).values()];

/** What turns the rules the form loaded into the rules it shows now. Rules in both are left alone. */
export function planRuleChanges(loaded: IngressPermission[], wanted: IngressPermission[]): RuleChanges {
  const loadedKeys = new Set(loaded.map(ruleKey));
  const wantedKeys = new Set(wanted.map(ruleKey));
  return {
    remove: uniqueByKey(loaded.filter((rule) => !wantedKeys.has(ruleKey(rule)))),
    add: uniqueByKey(wanted.filter((rule) => !loadedKeys.has(ruleKey(rule)))),
  };
}

/** The most rules one authorize-ingress call takes; console-api refuses a longer list. */
export const MAX_AUTHORIZE_RULES = 60;

/** Revoke takes one rule. Authorize takes a list and adds all of it or none of it, as AWS AuthorizeSecurityGroupIngress does. */
export type RuleOp =
  { kind: "revoke"; permission: IngressPermission } | { kind: "authorize"; permissions: IngressPermission[] };

export const opRules = (op: RuleOp): IngressPermission[] => (op.kind === "revoke" ? [op.permission] : op.permissions);

/**
 * The calls still needed to apply changes to the rules the group holds now. A removal already gone and an
 * addition already present drop out, so a retry after a partial failure or a double submit sends only the rest.
 * Revokes go first, so a save that stops halfway leaves the group allowing less, not more. The additions go in
 * one authorize call, as the AWS console's "Edit inbound rules" save sends them.
 */
export function planRuleOps(current: IngressPermission[], changes: RuleChanges): RuleOp[] {
  const held = new Map(current.map((rule) => [ruleKey(rule), rule]));
  const revokes = changes.remove.flatMap((rule): RuleOp[] => {
    const stored = held.get(ruleKey(rule));
    return stored ? [{ kind: "revoke", permission: stored }] : [];
  });
  const missing = uniqueByKey(changes.add.filter((rule) => !held.has(ruleKey(rule))));
  const authorizes: RuleOp[] = [];
  for (let start = 0; start < missing.length; start += MAX_AUTHORIZE_RULES)
    authorizes.push({ kind: "authorize", permissions: missing.slice(start, start + MAX_AUTHORIZE_RULES) });
  return [...revokes, ...authorizes];
}

/** The part of a rule op the group does not show yet, or null when it shows all of it. */
export function pendingPart(current: IngressPermission[], op: RuleOp): RuleOp | null {
  const keys = new Set(current.map(ruleKey));
  const rest = opRules(op).filter((rule) => keys.has(ruleKey(rule)) !== (op.kind === "authorize"));
  if (rest.length === 0) return null;
  return op.kind === "revoke" ? op : { kind: "authorize", permissions: rest };
}

/** A short label for one stored rule, such as "TCP 22 from 10.0.0.0/16". */
export function permissionLabel(permission: IngressPermission): string {
  if (permission.ipProtocol === "-1") return `All traffic from ${permission.cidrIp}`;
  if (permission.ipProtocol === "icmp")
    return permission.fromPort === 0 && permission.toPort === 0
      ? `ICMP from ${permission.cidrIp}`
      : `ICMP ${permission.fromPort}-${permission.toPort} from ${permission.cidrIp}`;
  const protocol = permission.ipProtocol.toUpperCase();
  const port =
    permission.fromPort === permission.toPort
      ? String(permission.fromPort)
      : `${permission.fromPort}-${permission.toPort}`;
  return `${protocol} ${port} from ${permission.cidrIp}`;
}

export const securityGroupFlashKey = (id: string) => `security-group:${id}`;
