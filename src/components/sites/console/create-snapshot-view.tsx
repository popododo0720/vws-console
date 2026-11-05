"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Volume } from "@/types/console";
import type { ApiError } from "@/lib/vws-api/adapter";
import { computeNav } from "@/lib/console-data";
import { parseCreateSnapshot, SNAPSHOT_DESCRIPTION_MAX } from "@/lib/ebs";
import { createSnapshotAction } from "@/app/actions/resources";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import {
  CreatePage,
  Field,
  FormCard,
  RefreshIconButton,
  TagsCard,
  primaryPill,
  useIdempotencyKey,
} from "@/components/sites/console/ebs-form-parts";
import { Shell } from "@/components/sites/console/shell";
import { OrangeButton } from "@/components/sites/console/ui";

function ResourceTypeTile({
  value,
  title,
  description,
  checked,
  disabled = false,
  onSelect,
}: {
  value: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={
        checked
          ? "flex flex-1 cursor-pointer gap-2 rounded-lg border-2 border-[#006ce0] bg-[#f0fbff] px-4 py-3"
          : "flex flex-1 gap-2 rounded-lg border border-[#8c8c94] px-4 py-3" + (disabled ? " cursor-not-allowed" : "")
      }
      title={disabled ? "console-api snapshots one volume at a time." : undefined}
    >
      <input
        type="radio"
        name="resource-type"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="mt-1 accent-[#006ce0]"
      />
      <span>
        <span className="block text-[14px]">{title}</span>
        <span className="block text-[12px] text-[#5f6b7a]">{description}</span>
      </span>
    </label>
  );
}

export function CreateSnapshotView({
  volumes,
  volumesError,
  initialVolumeId,
}: {
  volumes: Volume[];
  volumesError: ApiError | null;
  initialVolumeId: string;
}) {
  const router = useRouter();
  const action = useApiAction();
  const keyFor = useIdempotencyKey();
  const [volumeId, setVolumeId] = useState(volumes.some((item) => item.id === initialVolumeId) ? initialVolumeId : "");
  const [description, setDescription] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = () => {
    const parsed = parseCreateSnapshot({ volumeId, description });
    if ("code" in parsed) {
      setProblem(parsed.message);
      return;
    }
    setProblem(null);
    const key = keyFor(parsed);
    action.run(
      () => createSnapshotAction(parsed, key),
      () => router.push("/storage/snapshots"),
    );
  };

  return (
    <Shell tree={computeNav} navMode="overlay-only">
      <CreatePage
        crumbs={[
          { label: "EC2", href: "/compute/instances" },
          { label: "Snapshots", href: "/storage/snapshots" },
          { label: "Create snapshot" },
        ]}
        title="Create snapshot"
        info="The snapshot is created through the VWS API from the volume you choose."
        lead="Create a point-in-time snapshot of an EBS volume and use it as a baseline for new volumes or for data backup. You can create snapshots from an individual volume, or you can create multi-volume snapshots from all of the volumes attached to an instance."
      >
        <FormCard title="Source">
          <Field label="Resource type" info="Choose what to snapshot.">
            <div className="flex flex-col gap-3 sm:flex-row">
              <ResourceTypeTile
                value="volume"
                title="Volume"
                description="Create a snapshot from a specific volume."
                checked
                onSelect={() => undefined}
              />
              <ResourceTypeTile
                value="instance"
                title="Instance"
                description="Create multi-volume snapshots from an instance."
                checked={false}
                disabled
                onSelect={() => undefined}
              />
            </div>
          </Field>
          <Field
            label="Volume ID"
            htmlFor="snapshot-volume"
            description="The volume from which to create the snapshot."
          >
            <div className="flex max-w-[831px] items-center gap-5">
              <select
                id="snapshot-volume"
                className="field max-w-[779px]"
                value={volumeId}
                onChange={(event) => setVolumeId(event.target.value)}
              >
                <option value="" disabled>
                  Select a volume
                </option>
                {volumes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name ? `${item.id} (${item.name})` : item.id}
                  </option>
                ))}
              </select>
              <RefreshIconButton label="Refresh volumes" onClick={action.refresh} />
            </div>
            <ApiErrorAlert error={volumesError} title="Volumes could not be loaded" />
          </Field>
        </FormCard>
        <FormCard title="Snapshot details">
          <Field
            label="Description"
            htmlFor="snapshot-description"
            description="Add a description for your snapshot."
            hint={`${SNAPSHOT_DESCRIPTION_MAX} characters maximum`}
          >
            <input
              id="snapshot-description"
              className="field max-w-[779px]"
              maxLength={SNAPSHOT_DESCRIPTION_MAX}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </FormCard>
        <TagsCard title="Tags" />
        {problem ? (
          <p role="alert" className="text-[13px] text-[#d91515]">
            {problem}
          </p>
        ) : null}
        <ApiErrorAlert error={action.error} title="The snapshot could not be created" />
        <div className="flex items-center justify-end gap-6">
          <Link href="/storage/snapshots" className="text-[14px] font-bold text-[#006ce0] hover:underline">
            Cancel
          </Link>
          <OrangeButton className={primaryPill} disabled={action.pending} onClick={submit}>
            Create snapshot
          </OrangeButton>
        </div>
      </CreatePage>
    </Shell>
  );
}
