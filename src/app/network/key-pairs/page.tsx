import type { Metadata } from "next";
import { connection } from "next/server";
import { KeyPairsView } from "@/components/sites/console/key-pairs-view";
import { listKeyPairs } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Key pairs · VWS" };

export default async function Page() {
  await connection();
  const result = await listKeyPairs();
  return <KeyPairsView keyPairs={result.ok ? result.value : []} loadError={result.ok ? null : result.error} />;
}
