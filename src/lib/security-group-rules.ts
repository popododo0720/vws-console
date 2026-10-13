import type { SecurityGroupRule } from "@/types/console";

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
  const exact = RULE_TYPES.find((item) => item.protocol === rule.protocol && item.port === rule.port && !item.portEditable);
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
  return { id, direction, protocol, port, source, description };
}

const CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

function validCidr(value: string): boolean {
  const match = CIDR.exec(value);
  if (!match) return false;
  const octets = match.slice(1, 5).map(Number);
  return octets.every((octet) => octet <= 255) && Number(match[5]) <= 32;
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
  if (type.portEditable && !validPortRange(rule.port)) return "Port range must be a port or a range such as 8000-8080 (0-65535).";
  if (!validCidr(rule.source) && !/^sg-[0-9a-f]{8,}$/.test(rule.source)) return "Source must be a CIDR block such as 10.0.0.0/16 or a security group ID.";
  return null;
}
