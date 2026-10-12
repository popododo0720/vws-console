import type { Metadata } from "next";
import { CreateBucketView } from "@/components/sites/console/create-bucket-view";

export const metadata: Metadata = { title: "Create bucket · VWS" };

export default function Page() {
  return <CreateBucketView />;
}
