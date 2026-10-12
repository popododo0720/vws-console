import type { Metadata } from "next";
import { LaunchView } from "@/components/sites/console/launch-view";

export const metadata: Metadata = { title: "Launch an instance · VWS" };

export default function Page() {
  return <LaunchView />;
}
