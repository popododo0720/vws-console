import type { Metadata } from "next";
import { connection } from "next/server";
import { ImagesView } from "@/components/sites/console/images-view";
import { listImages } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "AMIs · VWS" };

export default async function Page() {
  await connection();
  const result = await listImages();
  return <ImagesView images={result.ok ? result.value : []} loadError={result.ok ? null : result.error} />;
}
