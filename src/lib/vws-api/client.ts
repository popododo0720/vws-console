import "server-only";
import { randomUUID } from "node:crypto";
import type { Instance, Subnet, Volume, Vpc } from "@/types/console";
import {
  EC2_VERSION,
  expectResponse,
  parseDescribeInstances,
  parseDescribeSubnets,
  parseDescribeVolumes,
  parseDescribeVpcs,
  parseEc2Error,
  type Ec2Result,
} from "./ec2";
import { signRequest } from "./sigv4";

type Config = { url: URL; region: string; accessKeyId: string; secretAccessKey: string };

function config(): Config | string {
  const url = process.env.VWS_API_URL;
  const accessKeyId = process.env.VWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.VWS_SECRET_ACCESS_KEY;
  const missing = [!url && "VWS_API_URL", !accessKeyId && "VWS_ACCESS_KEY_ID", !secretAccessKey && "VWS_SECRET_ACCESS_KEY"].filter(Boolean);
  if (missing.length > 0 || !url || !accessKeyId || !secretAccessKey) return `Set ${missing.join(", ")} on the console server.`;
  return { url: new URL(url), region: process.env.VWS_REGION || "vws-1", accessKeyId, secretAccessKey };
}

async function call<T>(action: string, params: Record<string, string>, parse: (xml: string) => T): Promise<Ec2Result<T>> {
  const cfg = config();
  if (typeof cfg === "string") return { ok: false, error: { code: "ConsoleNotConfigured", message: cfg, requestId: null } };
  const body = new URLSearchParams({ Action: action, Version: EC2_VERSION, ...params }).toString();
  const headers = signRequest(
    {
      method: "POST",
      url: cfg.url,
      headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
      body,
      service: "ec2",
      region: cfg.region,
      now: new Date(),
    },
    cfg,
  );
  let response: Response;
  let xml: string;
  try {
    response = await fetch(cfg.url, { method: "POST", headers, body, cache: "no-store" });
    xml = await response.text();
  } catch {
    return { ok: false, error: { code: "ServiceUnavailable", message: "The VWS API did not answer.", requestId: null } };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: parseEc2Error(xml) ?? { code: "InternalError", message: `The VWS API answered HTTP ${response.status}.`, requestId: null },
    };
  }
  try {
    return { ok: true, value: parse(xml) };
  } catch {
    return { ok: false, error: { code: "MalformedResponse", message: `The VWS API sent an unreadable ${action} response.`, requestId: null } };
  }
}

function indexed(name: string, values: string[]) {
  return Object.fromEntries(values.map((value, index) => [`${name}.${index + 1}`, value]));
}

function token() {
  return { ClientToken: randomUUID() };
}

const done = (response: string) => (xml: string) => expectResponse(xml, response);

export const describeInstances = (ids: string[] = []): Promise<Ec2Result<Instance[]>> =>
  call("DescribeInstances", indexed("InstanceId", ids), parseDescribeInstances);
export const describeVolumes = (): Promise<Ec2Result<Volume[]>> => call("DescribeVolumes", {}, parseDescribeVolumes);
export const describeVpcs = (): Promise<Ec2Result<Vpc[]>> => call("DescribeVpcs", {}, parseDescribeVpcs);
export const describeSubnets = (): Promise<Ec2Result<Subnet[]>> => call("DescribeSubnets", {}, parseDescribeSubnets);

export const startInstances = (ids: string[]) => call("StartInstances", { ...token(), ...indexed("InstanceId", ids) }, done("StartInstancesResponse"));
export const stopInstances = (ids: string[]) => call("StopInstances", { ...token(), ...indexed("InstanceId", ids) }, done("StopInstancesResponse"));
export const terminateInstances = (ids: string[]) =>
  call("TerminateInstances", { ...token(), ...indexed("InstanceId", ids) }, done("TerminateInstancesResponse"));
export const createVolume = (sizeGiB: number, volumeType: string) =>
  call("CreateVolume", { ...token(), Size: String(sizeGiB), VolumeType: volumeType }, done("CreateVolumeResponse"));
export const deleteVolume = (id: string) => call("DeleteVolume", { ...token(), VolumeId: id }, done("DeleteVolumeResponse"));
export const createSnapshot = (volumeId: string, description: string) =>
  call("CreateSnapshot", { ...token(), VolumeId: volumeId, ...(description ? { Description: description } : {}) }, done("CreateSnapshotResponse"));
export const createVpc = (cidr: string) => call("CreateVpc", { ...token(), CidrBlock: cidr }, done("CreateVpcResponse"));
export const deleteVpc = (id: string) => call("DeleteVpc", { ...token(), VpcId: id }, done("DeleteVpcResponse"));
export const createSubnet = (vpcId: string, cidr: string) => call("CreateSubnet", { ...token(), VpcId: vpcId, CidrBlock: cidr }, done("CreateSubnetResponse"));
export const deleteSubnet = (id: string) => call("DeleteSubnet", { ...token(), SubnetId: id }, done("DeleteSubnetResponse"));
