import type { Metadata } from "next";
import { KeyPairCreateView } from "@/components/sites/console/key-pair-create";

export const metadata: Metadata = { title: "Create key pair · VWS" };

export default function Page() {
  return <KeyPairCreateView mode="generate" />;
}
