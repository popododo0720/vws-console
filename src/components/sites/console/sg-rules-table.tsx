import type { SecurityGroupRule } from "@/types/console";
import { ruleTypeOf } from "@/lib/security-group-rules";
import { dash } from "@/components/sites/console/ui";

export const OUTBOUND_UNAVAILABLE = "The VWS API does not report outbound rules yet.";

export function RulesTable({
  rules,
  direction,
  unavailable,
}: {
  rules: SecurityGroupRule[];
  direction: SecurityGroupRule["direction"];
  unavailable?: string;
}) {
  if (unavailable) return <p className="py-6 text-center text-[13px] text-[#5f6b7a]">{unavailable}</p>;
  const sourceLabel = direction === "in" ? "Source" : "Destination";
  const rows = rules.filter((rule) => rule.direction === direction);
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] text-[#5f6b7a]">
        No {direction === "in" ? "inbound" : "outbound"} rules
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-[#e6e8eb] text-[#5f6b7a]">
            <th className="py-1 pr-3 font-semibold">Security group rule ID</th>
            <th className="py-1 pr-3 font-semibold">Type</th>
            <th className="py-1 pr-3 font-semibold">Protocol</th>
            <th className="py-1 pr-3 font-semibold">Port range</th>
            <th className="py-1 pr-3 font-semibold">{sourceLabel}</th>
            <th className="py-1 font-semibold">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((rule, index) => (
            <tr key={rule.id || index} className="border-b border-[#f2f3f3]">
              <td className="py-1 pr-3">{dash(rule.id)}</td>
              <td className="py-1 pr-3">{ruleTypeOf(rule).label}</td>
              <td className="py-1 pr-3">{rule.protocol}</td>
              <td className="py-1 pr-3">{rule.port}</td>
              <td className="py-1 pr-3">{dash(rule.source)}</td>
              <td className="py-1">{dash(rule.description)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
