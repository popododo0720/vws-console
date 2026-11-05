"use client";

import type { Vpc } from "@/types/console";

export function VpcFilter({
  vpcs,
  value,
  onChange,
}: {
  vpcs: readonly Pick<Vpc, "id" | "name">[];
  value: string;
  onChange: (vpcId: string) => void;
}) {
  return (
    <label className="block text-[12px]">
      Filter by VPC
      <select className="field mt-1" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">Choose a VPC</option>
        {vpcs.map((vpc) => (
          <option key={vpc.id} value={vpc.id}>
            {vpc.name || vpc.id}
          </option>
        ))}
      </select>
    </label>
  );
}
