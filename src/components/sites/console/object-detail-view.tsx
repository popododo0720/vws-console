"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteObjectAction } from "@/app/actions/resources";
import { REGION, type AccountBucket, type ApiError, type StoredObject } from "@/lib/vws-api/adapter";
import { copyToClipboard } from "@/lib/clipboard";
import { formatBucketCreationDate } from "@/lib/bucket-display";
import { formatBytes } from "@/lib/bucket-objects";
import { storageNav } from "@/lib/console-data";
import { download } from "@/lib/download";
import { objectArn, objectDownloadHref, objectFileName, objectType, s3Uri } from "@/lib/object-detail";
import { ApiErrorAlert } from "@/components/sites/console/api-action";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import {
  CopyText,
  DetailGrid,
  FieldLabel,
  MenuButton,
  MenuChevron,
  OrangeButton,
  OutlineButton,
  PanelDialog,
  dash,
  menuTriggerClass,
} from "@/components/sites/console/ui";

export type ObjectDetailProps = {
  name: string;
  objectKey: string;
  bucket: AccountBucket | null;
  object: StoredObject | null;
  loadError: ApiError | null;
};

const DELETE_WORD = "permanently delete";
const UNAVAILABLE = "Not returned for this object.";

export function ObjectDetailView({ name, objectKey, bucket, object, loadError }: ObjectDetailProps) {
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();

  const bucketHref = `/storage/buckets/${encodeURIComponent(name)}`;
  const crumbs = [
    { label: "S3", href: "/storage/buckets" },
    { label: "Buckets", href: "/storage/buckets" },
    { label: name, href: bucketHref },
    ...(objectKey ? [{ label: objectFileName(objectKey) }] : []),
  ];

  if (loadError || !bucket || !object) {
    return (
      <Shell tree={storageNav}>
        <PageHeader crumbs={crumbs} />
        <ApiErrorAlert error={loadError} title="The object could not be loaded" />
        {loadError ? null : (
          <div className="px-4 py-6 text-[13px]">
            <p className="font-semibold">{bucket ? "Object not found" : "Bucket not found"}</p>
            <p className="mt-1 break-all text-[#5f6b7a]">
              {bucket ? `${objectKey} is not in ${name}.` : `${name} is not in this account.`}
            </p>
            <Link
              href={bucket ? bucketHref : "/storage/buckets"}
              className="mt-3 inline-block text-[#006ce0] hover:underline"
            >
              {bucket ? "Back to bucket" : "Back to buckets"}
            </Link>
          </div>
        )}
      </Shell>
    );
  }

  const uri = s3Uri(bucket.name, object.key);
  const downloadHref = objectDownloadHref(bucket.name, object.key);

  const save = async () => {
    setDownloading(true);
    const failure = await download(downloadHref, objectFileName(object.key));
    setDownloading(false);
    setError(failure);
  };

  const copyUri = async () => {
    setCopied((await copyToClipboard(uri, "object-detail")) ? "copied" : "failed");
  };

  const remove = () =>
    startTransition(async () => {
      const failure = await deleteObjectAction(bucket.name, object.key);
      if (failure) {
        setError(failure);
        setConfirm("");
        return;
      }
      router.push(bucketHref);
    });

  return (
    <Shell tree={storageNav}>
      <div className="min-h-0 flex-1 overflow-auto bg-[#f3f3f5]">
        <PageHeader crumbs={crumbs} />
        <ApiErrorAlert error={error} title="The object action failed" />
        <div className="mb-3 flex gap-4 px-4 text-[14px]">
          <button type="button" className="border-b-2 border-[#006ce0] pb-2 font-semibold text-[#006ce0]">
            Properties
          </button>
          {["Permissions", "Versions"].map((label) => (
            <button
              key={label}
              type="button"
              disabled
              title={UNAVAILABLE}
              className="border-b-2 border-transparent pb-2 text-[#8d9aa8]"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mx-4 mb-6 space-y-3 rounded-lg border border-[#e6e8eb] bg-white p-4 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <OutlineButton onClick={() => void copyUri()}>
              {copied === "copied" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy S3 URI"}
            </OutlineButton>
            <OutlineButton disabled={downloading} onClick={() => void save()}>
              Download
            </OutlineButton>
            <OutlineButton disabled title="Opening an object in a new tab is not available in this console.">
              Open
            </OutlineButton>
            <MenuButton
              label={
                <span className={menuTriggerClass()}>
                  Object actions
                  <MenuChevron />
                </span>
              }
              items={[
                {
                  label: "Delete",
                  onSelect: () => {
                    setConfirm("");
                    setDialog(true);
                  },
                },
              ]}
            />
          </div>
          <h2 className="text-[16px] font-semibold">Object overview</h2>
          <DetailGrid
            items={[
              ["Owner", dash(bucket.ownerId)],
              ["AWS Region", REGION],
              ["Last modified", object.lastModified ? formatBucketCreationDate(object.lastModified) : "—"],
              ["Size", formatBytes(object.size)],
              ["Type", objectType(object.key)],
              ["Key", object.key],
              ["S3 URI", <CopyText key="uri" value={uri} />],
              ["Amazon Resource Name (ARN)", <CopyText key="arn" value={objectArn(bucket.name, object.key)} />],
              ["Entity tag (Etag)", dash(object.etag)],
              ["Object URL", <CopyText key="url" value={downloadHref} />],
            ]}
          />
        </div>
      </div>
      <PanelDialog
        open={dialog}
        title="Delete objects"
        onClose={() => setDialog(false)}
        footer={
          <>
            <OutlineButton onClick={() => setDialog(false)}>Cancel</OutlineButton>
            <OrangeButton disabled={confirm !== DELETE_WORD || pending} onClick={remove}>
              Delete objects
            </OrangeButton>
          </>
        }
      >
        <p className="mb-3">Deleting the specified objects can&apos;t be undone.</p>
        <p className="mb-3 break-all font-semibold">{object.key}</p>
        {error ? <p className="mb-3 text-[#d13212]">{error.message}</p> : null}
        <FieldLabel>To confirm deletion, type “{DELETE_WORD}” in the text input field.</FieldLabel>
        <input
          className="field"
          aria-label="Confirm deletion"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </PanelDialog>
    </Shell>
  );
}
