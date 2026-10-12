import type { Metadata } from "next";
import { SnapshotsView } from "@/components/sites/console/snapshots-view";

export const metadata: Metadata = { title: "Snapshots · VWS" };

export default function Page() {
  return <SnapshotsView />;
}
