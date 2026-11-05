"use client";

import { useState } from "react";
import type { Vpc } from "@/types/console";

/** The chosen VPC, or "all" once that VPC is no longer in the list, so the counts never filter by a VPC the select cannot show. */
export function useVpcFilter(vpcs: readonly Pick<Vpc, "id">[], initial = "all") {
  const [chosen, setChosen] = useState(initial);
  const active = chosen !== "all" && vpcs.some((vpc) => vpc.id === chosen) ? chosen : "all";
  return [active, setChosen] as const;
}

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
