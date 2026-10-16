import type { Metadata } from "next";
import { connection } from "next/server";
import { LaunchView } from "@/components/sites/console/launch-view";
import { listImages, listInstanceTypes, listKeyPairs, listSubnets, listVpcs } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Launch an instance · VWS" };

export default async function Page() {
  await connection();
  const [images, instanceTypes, vpcs, subnets, keyPairs] = await Promise.all([
    listImages(),
    listInstanceTypes(),
    listVpcs(),
    listSubnets(),
    listKeyPairs(),
  ]);
  const loadError = [images, instanceTypes, vpcs, subnets, keyPairs].find((result) => !result.ok);
  return (
    <LaunchView
      images={images.ok ? images.value : []}
      instanceTypes={instanceTypes.ok ? instanceTypes.value : []}
      vpcs={vpcs.ok ? vpcs.value : []}
      subnets={subnets.ok ? subnets.value : []}
      keyPairs={keyPairs.ok ? keyPairs.value : []}
      loadError={loadError && !loadError.ok ? loadError.error : null}
    />
  );
}
