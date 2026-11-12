"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Instance, Volume } from "@/types/console";
import type { ApiError } from "@/lib/vws-api/adapter";
import { computeNav } from "@/lib/console-data";
import { DEVICE_NAME } from "@/lib/ebs";
import { attachVolumeAction } from "@/app/actions/resources";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { CreatePage, Field, FormCard, Notice, primaryPill } from "@/components/sites/console/ebs-form-parts";
import { Shell } from "@/components/sites/console/shell";
import { OrangeButton } from "@/components/sites/console/ui";

const CUSTOM_DEVICE = "custom";
const DEFAULT_DATA_DEVICE = "/dev/sdf";
const ROOT_DEVICE_NAMES = ["/dev/sda1", "/dev/xvda"] as const;
const DATA_DEVICE_NAMES = Array.from(
  { length: 25 },
  (_, index) => `/dev/sd${String.fromCharCode("b".charCodeAt(0) + index)}`,
);

const labelled = (id: string, name: string) => (name ? `${id} (${name})` : id);

export function AttachVolumeView({
  id,
  volume,
  volumeError,
  instances,
  instancesError,
}: {
  id: string;
  volume: Volume | null;
  volumeError: ApiError | null;
  instances: Pick<Instance, "id" | "name" | "state" | "availabilityZone">[];
  instancesError: ApiError | null;
}) {
  const router = useRouter();
  const action = useApiAction();
  const [instanceId, setInstanceId] = useState("");
  const [device, setDevice] = useState(DEFAULT_DATA_DEVICE);
  const [customDevice, setCustomDevice] = useState("");
  const [instanceProblem, setInstanceProblem] = useState<string | null>(null);
  const [deviceProblem, setDeviceProblem] = useState<string | null>(null);

  const eligible = instances.filter(
    (item) =>
      (item.state === "running" || item.state === "stopped") && item.availabilityZone === volume?.availabilityZone,
  );
  const notAvailable = volume !== null && volume.state !== "available";
  const noInstances = volume !== null && !instancesError && eligible.length === 0;
  const blocked = volume === null || notAvailable || instancesError !== null || noInstances;

  const submit = () => {
    if (!volume) return;
    const deviceName = (device === CUSTOM_DEVICE ? customDevice : device).trim();
    const instanceMissing = !instanceId;
    const deviceMissing = !deviceName;
    const deviceInvalid = !deviceMissing && !DEVICE_NAME.test(deviceName);
    setInstanceProblem(instanceMissing ? "Choose an instance." : null);
    setDeviceProblem(
      deviceMissing ? "Enter a device name." : deviceInvalid ? "The device name must be a path like /dev/sdf." : null,
    );
    if (instanceMissing || deviceMissing || deviceInvalid) return;
    action.run(
      () => attachVolumeAction(volume.id, { instanceId, device: deviceName }),
      () => router.push("/storage/volumes"),
    );
  };

  return (
    <Shell tree={computeNav} navMode="overlay-only">
      <CreatePage
        crumbs={[
          { label: "EC2", href: "/compute/instances" },
          { label: "Volumes", href: "/storage/volumes" },
          { label: id, href: `/storage/volumes/${id}` },
          { label: "Attach volume" },
        ]}
        title="Attach volume"
        info="The volume is attached through the VWS API to the instance you choose."
        lead="Attach a volume to an instance to use it as you would a regular physical hard disk drive."
      >
        <ApiErrorAlert error={volumeError} title="The volume could not be loaded" />
        {!volumeError && !volume ? (
          <Notice title="Volume not found">
            <p className="mt-1">{id} is not in this region.</p>
            <Link href="/storage/volumes" className="mt-1 inline-block text-[#006ce0] hover:underline">
              Back to volumes
            </Link>
          </Notice>
        ) : null}
        {notAvailable ? (
          <Notice title="The volume cannot be attached">
            <p className="mt-1">
              {id} is {volume.state}. Only an available volume can be attached.
            </p>
          </Notice>
        ) : null}
        <ApiErrorAlert error={instancesError} title="Instances could not be loaded" />
        <FormCard title="Basic details">
          <Field label="Volume ID" htmlFor="attach-volume-id">
            <input
              id="attach-volume-id"
              className="field max-w-[779px]"
              disabled
              value={volume ? labelled(volume.id, volume.name) : id}
              readOnly
            />
          </Field>
          <Field label="Availability Zone" htmlFor="attach-volume-az">
            <input
              id="attach-volume-az"
              className="field max-w-[779px]"
              disabled
              value={volume?.availabilityZone ?? ""}
              readOnly
            />
          </Field>
          <Field
            label="Instance"
            htmlFor="attach-instance"
            description="Only instances in the same Availability Zone as the selected volume are displayed."
            error={instanceProblem}
          >
            {noInstances ? (
              <p>There are no running or stopped instances in this Availability Zone.</p>
            ) : (
              <select
                id="attach-instance"
                className="field max-w-[779px]"
                value={instanceId}
                onChange={(event) => setInstanceId(event.target.value)}
              >
                <option value="">Choose an instance</option>
                {eligible.map((item) => (
                  <option key={item.id} value={item.id}>
                    {labelled(item.id, item.name)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field
            label="Device name"
            htmlFor="attach-device"
            description="Recommended device names for Linux: /dev/sda1 for root volume. /dev/sd[f-p] for data volumes."
            error={deviceProblem}
          >
            <select
              id="attach-device"
              className="field max-w-[779px]"
              value={device}
              onChange={(event) => setDevice(event.target.value)}
            >
              <optgroup label="Reserved for root volume">
                {ROOT_DEVICE_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Recommended for data volumes">
                {DATA_DEVICE_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
              <option value={CUSTOM_DEVICE}>Specify a custom device name</option>
            </select>
            {device === CUSTOM_DEVICE ? (
              <input
                className="field mt-2 max-w-[779px]"
                aria-label="Custom device name"
                value={customDevice}
                onChange={(event) => setCustomDevice(event.target.value)}
              />
            ) : null}
          </Field>
          <p role="note" className="rounded-lg border border-[#006ce0] bg-[#f0fbff] px-3 py-2 text-[14px]">
            Newer Linux kernels may rename your devices to /dev/xvdf through /dev/xvdp internally, even when the device
            name entered here (and shown in the details) is /dev/sdf through /dev/sdp.
          </p>
        </FormCard>
        <ApiErrorAlert error={action.error} title="The volume could not be attached" />
        <div className="flex items-center justify-end gap-6">
          <Link href="/storage/volumes" className="text-[14px] font-bold text-[#006ce0] hover:underline">
            Cancel
          </Link>
          <OrangeButton
            action="ec2:AttachVolume"
            className={primaryPill}
            disabled={action.pending || blocked}
            onClick={submit}
          >
            Attach volume
          </OrangeButton>
        </div>
      </CreatePage>
    </Shell>
  );
}
