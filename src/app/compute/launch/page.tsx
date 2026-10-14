import type { Metadata } from "next";
import { connection } from "next/server";
import { LaunchView } from "@/components/sites/console/launch-view";
import { listImages, listSubnets, listVpcs } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Launch an instance · VWS" };

export default async function Page() {
  await connection();
  const [images, vpcs, subnets] = await Promise.all([listImages(), listVpcs(), listSubnets()]);
  const loadError = [images, vpcs, subnets].find((result) => !result.ok);
  return (
    <LaunchView
      images={images.ok ? images.value : []}
      vpcs={vpcs.ok ? vpcs.value : []}
      subnets={subnets.ok ? subnets.value : []}
      loadError={loadError && !loadError.ok ? loadError.error : null}
    />
  );
}
