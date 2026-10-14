import type { SecurityGroupRule } from "@/types/console";
import { toIngressPermission, type IngressPermission } from "@/lib/vws-api/adapter";

/** Maps inbound rules onto authorize-ingress bodies; the first rule the API cannot take stops it. */
export function ingressPermissions(rules: SecurityGroupRule[]): { permissions: IngressPermission[]; error: string | null } {
  const permissions: IngressPermission[] = [];
  for (const [index, rule] of rules.entries()) {
    const mapped = toIngressPermission(rule);
    if (!mapped.ok) return { permissions: [], error: `Rule ${index + 1}: ${mapped.error}` };
    permissions.push(mapped.value);
  }
  return { permissions, error: null };
}
