import type { Metadata } from "next";
import { VolumesView } from "@/components/sites/console/volumes-view";

export const metadata: Metadata = { title: "Volumes · VWS" };

export default function Page() {
  return <VolumesView />;
}
