import { XMLParser } from "fast-xml-parser";
import type { Instance, InstanceState, Subnet, Volume, Vpc } from "@/types/console";

export const EC2_VERSION = "2016-11-15";

export type ApiError = { code: string; message: string; requestId: string | null };

export type Ec2Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  isArray: (name) => name === "item",
});

function obj(value: unknown): Node {
  return typeof value === "object" && value !== null ? (value as Node) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function items(value: unknown): Node[] {
  const list = obj(value).item;
  return Array.isArray(list) ? list.map(obj) : [];
}

/** Parses an EC2 Query error body. Returns null when the body is not one. */
export function parseEc2Error(xml: string): ApiError | null {
  const root = obj(parser.parse(xml)).Response;
  if (!root) return null;
  const error = obj(obj(obj(root).Errors).Error);
  const code = text(error.Code);
  if (!code) return null;
  return { code, message: text(error.Message), requestId: text(obj(root).RequestID) || null };
}

function body(xml: string, response: string): Node {
  const root = obj(parser.parse(xml))[response];
  if (root === undefined) throw new Error(`expected <${response}>`);
  return obj(root);
}

const instanceStates: readonly InstanceState[] = ["pending", "running", "stopping", "stopped", "shutting-down", "terminated"];

function instanceState(name: string): InstanceState {
  const found = instanceStates.find((state) => state === name);
  if (!found) throw new Error(`unknown instance state ${name}`);
  return found;
}

function instanceOf(item: Node): Instance {
  return {
    id: text(item.instanceId),
    name: "",
    state: instanceState(text(obj(item.instanceState).name)),
    type: text(item.instanceType),
    status: "none",
    checksPassed: 0,
    checksTotal: 0,
    availabilityZone: text(obj(item.placement).availabilityZone),
    publicDns: "",
    publicIpv4: "",
    privateIpv4: text(item.privateIpAddress),
    privateDns: "",
    elasticIp: "",
    ipv6: "",
    region: "",
    vpcId: "",
    subnetId: text(item.subnetId),
    securityGroupIds: [],
    keyPair: "",
    imageId: text(item.imageId),
    launchedAt: "",
  };
}

export function parseDescribeInstances(xml: string): Instance[] {
  return items(body(xml, "DescribeInstancesResponse").reservationSet).flatMap((r) => items(r.instancesSet).map(instanceOf));
}

export function parseDescribeVolumes(xml: string): Volume[] {
  return items(body(xml, "DescribeVolumesResponse").volumeSet).map((item) => ({
    id: text(item.volumeId),
    name: "",
    state: text(item.status),
    volumeType: text(item.volumeType),
    sizeGiB: Number(text(item.size)),
    iops: null,
    throughput: "",
    owner: "",
    snapshotId: text(item.snapshotId),
    sourceVolumeId: "",
    created: text(item.createTime),
    availabilityZone: text(item.availabilityZone),
    region: "",
    attachedTo: text(items(item.attachmentSet)[0]?.instanceId),
  }));
}

export function parseDescribeVpcs(xml: string): Vpc[] {
  return items(body(xml, "DescribeVpcsResponse").vpcSet).map((item) => ({
    id: text(item.vpcId),
    name: "",
    state: text(item.state) === "available" ? "available" : "pending",
    encryption: "",
    encryptionControl: "",
    blockPublicAccess: "",
    ipv4Cidr: text(item.cidrBlock),
    ipv6Cidr: "",
    owner: text(item.ownerId),
    isDefault: text(item.isDefault) === "true",
    region: "",
  }));
}

export function parseDescribeSubnets(xml: string): Subnet[] {
  return items(body(xml, "DescribeSubnetsResponse").subnetSet).map((item) => ({
    id: text(item.subnetId),
    name: "",
    vpcId: text(item.vpcId),
    state: text(item.state) === "available" ? "available" : "pending",
    ipv4Cidr: text(item.cidrBlock),
    availableIps: null,
    availabilityZone: "",
    routeTableId: "",
    autoAssignPublicIp: null,
    region: "",
  }));
}

/** Checks that a mutation answered with its own response element. */
export function expectResponse(xml: string, response: string): void {
  body(xml, response);
}
