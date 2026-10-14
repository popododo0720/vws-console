"use server";

import * as vws from "@/lib/vws-api/client";
import type { ApiError, Ec2Result } from "@/lib/vws-api/ec2";

async function each(ids: string[], run: (id: string) => Promise<Ec2Result<void>>): Promise<ApiError | null> {
  for (const id of ids) {
    const result = await run(id);
    if (!result.ok) return result.error;
  }
  return null;
}

const errorOf = async (pending: Promise<Ec2Result<void>>) => {
  const result = await pending;
  return result.ok ? null : result.error;
};

export async function startInstancesAction(ids: string[]) {
  return errorOf(vws.startInstances(ids));
}

export async function stopInstancesAction(ids: string[]) {
  return errorOf(vws.stopInstances(ids));
}

export async function terminateInstancesAction(ids: string[]) {
  return errorOf(vws.terminateInstances(ids));
}

export async function createVolumeAction(sizeGiB: number, volumeType: string) {
  return errorOf(vws.createVolume(sizeGiB, volumeType));
}

export async function deleteVolumesAction(ids: string[]) {
  return each(ids, vws.deleteVolume);
}

export async function createSnapshotAction(volumeId: string, description: string) {
  return errorOf(vws.createSnapshot(volumeId, description));
}

export async function createVpcAction(cidr: string) {
  return errorOf(vws.createVpc(cidr));
}

export async function deleteVpcsAction(ids: string[]) {
  return each(ids, vws.deleteVpc);
}

export async function createSubnetAction(vpcId: string, cidr: string) {
  return errorOf(vws.createSubnet(vpcId, cidr));
}

export async function deleteSubnetsAction(ids: string[]) {
  return each(ids, vws.deleteSubnet);
}
