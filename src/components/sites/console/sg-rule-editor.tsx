"use client";

import type { SecurityGroupRule } from "@/types/console";
import { RULE_TYPES, makeRule, newRuleId, ruleTypeOf, validateRule } from "@/lib/security-group-rules";
import { OutlineButton } from "@/components/sites/console/ui";

export function newDraftRule(direction: SecurityGroupRule["direction"]): SecurityGroupRule {
  return makeRule(direction, "TCP", "22", "0.0.0.0/0", `new-${newRuleId()}`);
}

export function finalizeRules(rules: SecurityGroupRule[]): SecurityGroupRule[] {
  return rules.map((rule) => (rule.id.startsWith("new-") ? { ...rule, id: newRuleId() } : rule));
}

export function firstRuleError(rules: SecurityGroupRule[]): string | null {
  for (const [index, rule] of rules.entries()) {
    const error = validateRule(rule);
    if (error) return `Rule ${index + 1}: ${error}`;
  }
  return null;
}

export function RuleEditor({
  direction,
  rules,
  onChange,
}: {
  direction: SecurityGroupRule["direction"];
  rules: SecurityGroupRule[];
  onChange: (rules: SecurityGroupRule[]) => void;
}) {
  const sourceLabel = direction === "in" ? "Source" : "Destination";
  const patch = (id: string, next: Partial<SecurityGroupRule>) =>
    onChange(rules.map((rule) => (rule.id === id ? { ...rule, ...next } : rule)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-[13px]">
        <thead>
          <tr className="text-[#5f6b7a]">
            <th className="py-1 pr-2 font-semibold">Security group rule ID</th>
            <th className="py-1 pr-2 font-semibold">Type</th>
            <th className="py-1 pr-2 font-semibold">Protocol</th>
            <th className="py-1 pr-2 font-semibold">Port range</th>
            <th className="py-1 pr-2 font-semibold">{sourceLabel}</th>
            <th className="py-1 pr-2 font-semibold">Description - optional</th>
            <th className="py-1 font-semibold" />
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, index) => {
            const type = ruleTypeOf(rule);
            const error = validateRule(rule);
            return (
              <tr key={rule.id} className="align-top">
                <td className="py-1 pr-2 text-[#5f6b7a]">{rule.id.startsWith("new-") ? "—" : rule.id}</td>
                <td className="py-1 pr-2">
                  <select
                    aria-label={`Rule ${index + 1} type`}
                    className="field"
                    value={type.id}
                    onChange={(event) => {
                      const next = RULE_TYPES.find((item) => item.id === event.target.value);
                      if (next) patch(rule.id, { protocol: next.protocol, port: next.port });
                    }}
                  >
                    {RULE_TYPES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <input aria-label={`Rule ${index + 1} protocol`} className="field" value={rule.protocol} readOnly disabled />
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label={`Rule ${index + 1} port range`}
                    className="field"
                    value={rule.port}
                    disabled={!type.portEditable}
                    placeholder="e.g. 8080"
                    onChange={(event) => patch(rule.id, { port: event.target.value.trim() })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label={`Rule ${index + 1} ${sourceLabel.toLowerCase()}`}
                    className="field"
                    value={rule.source}
                    aria-invalid={error ? true : undefined}
                    placeholder="0.0.0.0/0"
                    onChange={(event) => patch(rule.id, { source: event.target.value.trim() })}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    aria-label={`Rule ${index + 1} description`}
                    className="field"
                    value={rule.description}
                    onChange={(event) => patch(rule.id, { description: event.target.value })}
                  />
                </td>
                <td className="py-1">
                  <OutlineButton onClick={() => onChange(rules.filter((item) => item.id !== rule.id))}>Delete</OutlineButton>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-2">
        <OutlineButton onClick={() => onChange([...rules, newDraftRule(direction)])}>
          Add rule
        </OutlineButton>
      </div>
    </div>
  );
}
