import type { IngressPermission, SecurityGroupRule } from "@/types/console";
import { toIngressPermission, toIngressRule } from "@/lib/vws-api/adapter";
import { ruleKey } from "@/lib/security-group-rules";

/** A stored rule whose type and ports the user left as they were keeps its stored ports, so ICMP type and code survive. */
function wantedPermission(rule: SecurityGroupRule) {
  const mapped = toIngressPermission(rule);
  if (!mapped.ok || !rule.permission) return mapped;
  const stored = toIngressRule(rule.permission);
  if (stored.protocol !== rule.protocol || stored.port !== rule.port) return mapped;
  return { ok: true as const, value: { ...rule.permission, cidrIp: mapped.value.cidrIp } };
}

/** Maps inbound rules onto the values console-api stores; the first rule it cannot take, or a repeat, stops it. */
export function ingressPermissions(rules: SecurityGroupRule[]): {
  permissions: IngressPermission[];
  error: string | null;
} {
  const permissions: IngressPermission[] = [];
  const seen = new Map<string, number>();
  for (const [index, rule] of rules.entries()) {
    const mapped = wantedPermission(rule);
    if (!mapped.ok) return { permissions: [], error: `Rule ${index + 1}: ${mapped.error}` };
    const first = seen.get(ruleKey(mapped.value));
    if (first !== undefined) return { permissions: [], error: `Rule ${index + 1} is the same as rule ${first + 1}.` };
    seen.set(ruleKey(mapped.value), index);
    permissions.push(mapped.value);
  }
  return { permissions, error: null };
}
