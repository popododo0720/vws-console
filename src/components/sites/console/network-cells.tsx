import { CircleCheck, CircleMinus } from "lucide-react";
import type { BlockPublicAccess } from "@/types/console";

export function SuccessBadge({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f6e9] px-2 py-0.5 text-[12px] font-medium text-[#037f0c]">
      <CircleCheck className="size-3.5" />
      {children}
    </span>
  );
}

export function blockPublicAccessLabel(value: BlockPublicAccess) {
  return value === "" ? "—" : value === "off" ? "Off" : "On";
}

export function BlockPublicAccessCell({ value }: { value: BlockPublicAccess }) {
  if (value === "") return <>—</>;
  return (
    <span className="inline-flex items-center gap-1 text-[#5f6b7a]">
      <CircleMinus className="size-3.5" />
      {blockPublicAccessLabel(value)}
    </span>
  );
}
