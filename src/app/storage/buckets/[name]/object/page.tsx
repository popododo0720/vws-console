import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { ObjectDetailView, type ObjectDetailProps } from "@/components/sites/console/object-detail-view";
import { parseObjectTarget } from "@/lib/object-detail";
import { getBucket, getObjectMeta } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Object · VWS" };

function displayName(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function load(raw: string, prefix: string | string[] | undefined): Promise<ObjectDetailProps> {
  const name = displayName(raw);
  const target = parseObjectTarget(raw, prefix === undefined ? [] : [prefix].flat());
  if (!target.ok) {
    return {
      name,
      objectKey: "",
      bucket: null,
      object: null,
      loadError: target.reason === "key" ? target.error : null,
    };
  }
  const [bucket, object] = await Promise.all([getBucket(target.bucket), getObjectMeta(target.bucket, target.key)]);
  const base = { name, objectKey: target.key };
  if (!bucket.ok) return { ...base, bucket: null, object: null, loadError: bucket.error };
  if (!bucket.value) return { ...base, bucket: null, object: null, loadError: null };
  if (!object.ok) return { ...base, bucket: bucket.value, object: null, loadError: object.error };
  return { ...base, bucket: bucket.value, object: object.value, loadError: null };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  const { name } = await params;
  const { prefix } = await searchParams;
  return (
    <Suspense>
      <ObjectDetailView {...await load(name, prefix)} />
    </Suspense>
  );
}
