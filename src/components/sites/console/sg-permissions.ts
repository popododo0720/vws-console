import type { SecurityGroupRule } from "@/types/console";
import { toIpPermission, type IpPermission } from "@/lib/vws-api/adapter";

/** Maps inbound rules onto the IpPermissions of one authorize-ingress call; the first bad rule stops it. */
export function ingressPermissions(rules: SecurityGroupRule[]): {
  permissions: IpPermission[];
  error: string | null;
} {
  const permissions: IpPermission[] = [];
  for (const [index, rule] of rules.entries()) {
    const mapped = toIpPermission(rule);
    if (!mapped.ok) return { permissions: [], error: `Rule ${index + 1}: ${mapped.error}` };
    permissions.push(mapped.value);
  }
  return { permissions, error: null };
}
