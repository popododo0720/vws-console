import type { Metadata } from "next";
import { Suspense } from "react";
import { UploadView } from "@/components/sites/console/upload-view";

export const metadata: Metadata = { title: "Upload · VWS" };

export default async function Page({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return (
    <Suspense>
      <UploadView name={decodeURIComponent(name)} />
    </Suspense>
  );
}
