import { describe, expect, it } from "vitest";
import { parseDescribeInstances, parseDescribeSubnets, parseDescribeVolumes, parseDescribeVpcs, parseEc2Error } from "./ec2";

const head = '<?xml version="1.0" encoding="UTF-8"?>\n';

describe("EC2 Query parsing", () => {
  it("reads instances across reservations", () => {
    const xml = `${head}<DescribeInstancesResponse><requestId>r-1</requestId><reservationSet>
      <item><reservationId>r-a</reservationId><instancesSet><item><instanceId>i-0aa</instanceId><imageId>ami-1</imageId><instanceType>vws.small</instanceType><subnetId>subnet-1</subnetId><placement><availabilityZone>vws-1a</availabilityZone></placement><privateIpAddress>10.0.1.5</privateIpAddress><instanceState><code>16</code><name>running</name></instanceState></item></instancesSet></item>
      <item><reservationId>r-b</reservationId><instancesSet><item><instanceId>i-0bb</instanceId><imageId>ami-1</imageId><instanceType>vws.medium</instanceType><subnetId>subnet-1</subnetId><placement><availabilityZone>vws-1a</availabilityZone></placement><instanceState><code>80</code><name>stopped</name></instanceState></item></instancesSet></item>
    </reservationSet></DescribeInstancesResponse>`;
    const [a, b] = parseDescribeInstances(xml);
    expect([a.id, a.state, a.type, a.availabilityZone, a.privateIpv4, a.subnetId, a.imageId]).toEqual([
      "i-0aa", "running", "vws.small", "vws-1a", "10.0.1.5", "subnet-1", "ami-1",
    ]);
    expect([b.id, b.state, b.privateIpv4, b.publicIpv4, b.name]).toEqual(["i-0bb", "stopped", "", "", ""]);
  });

  it("returns an empty list for an empty set", () => {
    expect(parseDescribeInstances(`${head}<DescribeInstancesResponse><requestId>r</requestId><reservationSet></reservationSet></DescribeInstancesResponse>`)).toEqual([]);
    expect(parseDescribeVpcs(`${head}<DescribeVpcsResponse><requestId>r</requestId><vpcSet></vpcSet></DescribeVpcsResponse>`)).toEqual([]);
  });

  it("rejects an instance state the console does not know", () => {
    const xml = `${head}<DescribeInstancesResponse><reservationSet><item><instancesSet><item><instanceId>i-1</instanceId><instanceState><code>0</code><name>rebooting</name></instanceState></item></instancesSet></item></reservationSet></DescribeInstancesResponse>`;
    expect(() => parseDescribeInstances(xml)).toThrow("unknown instance state rebooting");
  });

  it("rejects a body for a different action", () => {
    expect(() => parseDescribeVolumes(`${head}<DescribeVpcsResponse><vpcSet></vpcSet></DescribeVpcsResponse>`)).toThrow("expected <DescribeVolumesResponse>");
  });

  it("reads volumes with and without attachments", () => {
    const xml = `${head}<DescribeVolumesResponse><requestId>r</requestId><volumeSet>
      <item><volumeId>vol-1</volumeId><size>8</size><availabilityZone>vws-1a</availabilityZone><status>in-use</status><volumeType>gp3</volumeType><createTime>2026-10-14T05:00:00Z</createTime><attachmentSet><item><volumeId>vol-1</volumeId><instanceId>i-0aa</instanceId><device>/dev/vdb</device><status>attached</status></item></attachmentSet></item>
      <item><volumeId>vol-2</volumeId><size>20</size><availabilityZone>vws-1a</availabilityZone><status>available</status><volumeType>gp2</volumeType><snapshotId>snap-1</snapshotId><attachmentSet></attachmentSet></item>
    </volumeSet></DescribeVolumesResponse>`;
    const [a, b] = parseDescribeVolumes(xml);
    expect([a.id, a.state, a.sizeGiB, a.volumeType, a.attachedTo, a.created, a.iops, a.owner]).toEqual([
      "vol-1", "in-use", 8, "gp3", "i-0aa", "2026-10-14T05:00:00Z", null, "",
    ]);
    expect([b.id, b.state, b.sizeGiB, b.attachedTo, b.snapshotId]).toEqual(["vol-2", "available", 20, "", "snap-1"]);
  });

  it("reads VPCs and subnets", () => {
    const vpcs = parseDescribeVpcs(`${head}<DescribeVpcsResponse><vpcSet><item><vpcId>vpc-1</vpcId><state>available</state><cidrBlock>10.0.0.0/16</cidrBlock><ownerId>123456789012</ownerId><isDefault>false</isDefault></item></vpcSet></DescribeVpcsResponse>`);
    expect(vpcs.map((v) => [v.id, v.state, v.ipv4Cidr, v.owner, v.isDefault, v.blockPublicAccess])).toEqual([
      ["vpc-1", "available", "10.0.0.0/16", "123456789012", false, ""],
    ]);
    const subnets = parseDescribeSubnets(`${head}<DescribeSubnetsResponse><subnetSet><item><subnetId>subnet-1</subnetId><vpcId>vpc-1</vpcId><cidrBlock>10.0.1.0/24</cidrBlock><state>pending</state></item></subnetSet></DescribeSubnetsResponse>`);
    expect(subnets.map((s) => [s.id, s.vpcId, s.ipv4Cidr, s.state, s.availableIps, s.availabilityZone])).toEqual([
      ["subnet-1", "vpc-1", "10.0.1.0/24", "pending", null, ""],
    ]);
  });

  it("reads the error envelope", () => {
    const xml = `${head}<Response><Errors><Error><Code>InvalidVpcID.NotFound</Code><Message>vpc-9 does not exist</Message></Error></Errors><RequestID>req-42</RequestID></Response>`;
    expect(parseEc2Error(xml)).toEqual({ code: "InvalidVpcID.NotFound", message: "vpc-9 does not exist", requestId: "req-42" });
    expect(parseEc2Error(`${head}<DescribeVpcsResponse/>`)).toBeNull();
  });
});
