import { describe, expect, it } from "vitest";
import {
  formatEc2Time,
  formatSummaryTime,
  parseCreateSnapshot,
  parseCreateVolume,
  snapshotProgress,
  VOLUME_TYPES,
} from "@/lib/ebs";

const gp3 = { volumeType: "gp3", size: 100, iops: 3000, throughput: 125, availabilityZone: "vws-1a", snapshotId: null };

describe("parseCreateVolume", () => {
  it("accepts the AWS form defaults", () => {
    expect(parseCreateVolume(gp3)).toEqual(gp3);
  });

  it("fills gp3 IOPS and throughput defaults when they are left out", () => {
    expect(parseCreateVolume({ ...gp3, iops: null, throughput: undefined })).toMatchObject({
      iops: 3000,
      throughput: 125,
    });
  });

  it.each([
    [{ ...gp3, size: 0 }, "Size must be from 1 to 65536 GiB."],
    [{ ...gp3, size: 65537 }, "Size must be from 1 to 65536 GiB."],
    [{ ...gp3, size: 1.5 }, "Size must be a whole number."],
    [{ ...gp3, size: "100" }, "Size must be a whole number."],
    [{ ...gp3, size: null }, "Size must be from 1 to 65536 GiB."],
    [{ ...gp3, iops: 2999 }, "IOPS must be from 3000 to 80000 IOPS."],
    [{ ...gp3, iops: 80001 }, "IOPS must be from 3000 to 80000 IOPS."],
    [{ ...gp3, size: 8, iops: 5000 }, "IOPS can be at most 500 per GiB of size."],
    [{ ...gp3, throughput: 2001 }, "Throughput must be from 125 to 2000 MiB/s."],
    [{ ...gp3, throughput: 1000 }, "Throughput can be at most 0.25 MiB/s per IOPS."],
    [{ ...gp3, volumeType: "gp2", iops: 300, throughput: null }, "gp2 volumes do not take IOPS."],
    [{ ...gp3, volumeType: "standard", iops: null, size: 1025 }, "Size must be from 1 to 1024 GiB."],
    [{ ...gp3, volumeType: "io2" }, "Choose a volume type."],
    [{ ...gp3, availabilityZone: "" }, "Choose an Availability Zone."],
    [{ ...gp3, availabilityZone: "vws-1a\n<script>" }, "Choose an Availability Zone."],
    [{ ...gp3, snapshotId: "snap-../../etc" }, "The snapshot ID is not valid."],
    [null, "The request is not valid."],
    ["gp3", "The request is not valid."],
  ])("refuses %j", (input, message) => {
    expect(parseCreateVolume(input)).toMatchObject({ code: "InvalidParameterValue", message });
  });

  it("lets a volume restored from a snapshot leave the size to the snapshot", () => {
    expect(parseCreateVolume({ ...gp3, size: null, snapshotId: "snap-0123456789abcdef0" })).toMatchObject({
      size: null,
      snapshotId: "snap-0123456789abcdef0",
    });
  });

  it("accepts every boundary of every offered type", () => {
    for (const spec of VOLUME_TYPES) {
      for (const size of [spec.size.min, spec.size.max]) {
        const input = { ...gp3, volumeType: spec.type, size, iops: null, throughput: null };
        expect(parseCreateVolume(input)).toMatchObject({ volumeType: spec.type, size });
      }
    }
  });
});

describe("parseCreateSnapshot", () => {
  it("accepts a volume and a 255-character description", () => {
    const description = "d".repeat(255);
    expect(parseCreateSnapshot({ volumeId: "vol-0123456789abcdef0", description })).toEqual({
      volumeId: "vol-0123456789abcdef0",
      description,
    });
  });

  it.each([
    [{ volumeId: "", description: "" }, "Choose a volume."],
    [{ volumeId: "vol-1/../delete", description: "" }, "Choose a volume."],
    [
      { volumeId: "vol-0123456789abcdef0", description: "d".repeat(256) },
      "The description can have at most 255 characters.",
    ],
    [{ volumeId: "vol-0123456789abcdef0", description: 7 }, "The description is not valid."],
    [
      { volumeId: "vol-0123456789abcdef0", description: "é".repeat(128) },
      "The description can have at most 255 characters.",
    ],
  ])("refuses %j", (input, message) => {
    expect(parseCreateSnapshot(input)).toMatchObject({ code: "InvalidParameterValue", message });
  });
});

describe("display", () => {
  it("formats times in UTC as the EC2 tables do", () => {
    expect(formatEc2Time("2026-11-05T08:26:38.12773347Z")).toBe("2026/11/05 08:26 GMT+0");
    expect(formatEc2Time("not a date")).toBe("not a date");
    expect(formatEc2Time("")).toBe("");
    expect(formatSummaryTime("2026-11-05T08:26:38.000Z")).toBe("Thu, Nov 5, 2026, 8:26:38 AM (GMT+00:00)");
  });

  it("shows snapshot progress as EC2 does", () => {
    expect(snapshotProgress("completed")).toBe("Available (100%)");
    expect(snapshotProgress("pending")).toBe("Pending");
    expect(snapshotProgress("")).toBe("—");
  });
});
