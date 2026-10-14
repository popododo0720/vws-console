"use server";

import * as vws from "@/lib/vws-api/client";
import type { ApiError, ApiResult, IngressPermission, LaunchRequest } from "@/lib/vws-api/adapter";

async function each(ids: string[], run: (id: string) => Promise<ApiResult<void>>): Promise<ApiError | null> {
  for (const id of ids) {
    const result = await run(id);
    if (!result.ok) return result.error;
  }
  return null;
}

const errorOf = async (pending: Promise<ApiResult<void>>) => {
  const result = await pending;
  return result.ok ? null : result.error;
};

export async function launchInstancesAction(req: LaunchRequest) {
  return errorOf(vws.launchInstances(req));
}

export async function startInstancesAction(ids: string[]) {
  return each(ids, vws.startInstance);
}

export async function stopInstancesAction(ids: string[]) {
  return each(ids, vws.stopInstance);
}

export async function terminateInstancesAction(ids: string[]) {
  return each(ids, vws.terminateInstance);
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

export async function createSecurityGroupAction(groupName: string, vpcId: string, inbound: IngressPermission[]) {
  const created = await vws.createSecurityGroup(groupName, vpcId);
  if (!created.ok) return created.error;
  return authorizeIngressAction(created.value, inbound);
}

/** console-api takes one rule per call, so rules are added in order and the first failure stops the rest. */
export async function authorizeIngressAction(groupId: string, inbound: IngressPermission[]) {
  for (const permission of inbound) {
    const result = await vws.authorizeIngress(groupId, permission);
    if (!result.ok) return result.error;
  }
  return null;
}

export async function deleteSecurityGroupsAction(ids: string[]) {
  return each(ids, vws.deleteSecurityGroup);
}

export async function allocateAddressAction() {
  return errorOf(vws.allocateAddress());
}

export async function associateAddressAction(allocationId: string, instanceId: string) {
  return errorOf(vws.associateAddress(allocationId, instanceId));
}

export async function disassociateAddressesAction(ids: string[]) {
  return each(ids, vws.disassociateAddress);
}

export async function releaseAddressesAction(ids: string[]) {
  return each(ids, vws.releaseAddress);
}

export async function deleteSnapshotsAction(ids: string[]) {
  return each(ids, vws.deleteSnapshot);
}
