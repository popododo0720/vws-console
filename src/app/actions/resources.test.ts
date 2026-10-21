import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  authorizeIngress: vi.fn(),
  createSecurityGroup: vi.fn(),
}));
vi.mock("@/lib/vws-api/client", () => client);

import { authorizeIngressAction, createSecurityGroupAction } from "./resources";

const ssh = { ipProtocol: "tcp", fromPort: 22, toPort: 22, ipRanges: [{ cidrIp: "0.0.0.0/0" }] };
const https = { ipProtocol: "tcp", fromPort: 443, toPort: 443, ipRanges: [{ cidrIp: "0.0.0.0/0" }] };

describe("security group actions", () => {
  beforeEach(() => {
    client.authorizeIngress.mockReset().mockResolvedValue({ ok: true, value: undefined });
    client.createSecurityGroup.mockReset().mockResolvedValue({ ok: true, value: "sg-9" });
  });

  it("adds every new inbound rule in one authorize-ingress call", async () => {
    expect(await authorizeIngressAction("sg-1", [ssh, https])).toBeNull();
    expect(client.authorizeIngress.mock.calls).toEqual([["sg-1", [ssh, https]]]);
  });

  it("returns the API error and does not resend the rules one by one", async () => {
    const error = { code: "InvalidPermission.Duplicate", message: "duplicate permission", requestId: "req-1" };
    client.authorizeIngress.mockResolvedValue({ ok: false, error });
    expect(await authorizeIngressAction("sg-1", [ssh, https])).toEqual(error);
    expect(client.authorizeIngress).toHaveBeenCalledTimes(1);
  });

  it("creates a group without rules and makes no authorize-ingress call", async () => {
    expect(await createSecurityGroupAction("web", "vpc-1", [])).toBeNull();
    expect(client.createSecurityGroup).toHaveBeenCalledWith("web", "vpc-1");
    expect(client.authorizeIngress).not.toHaveBeenCalled();
  });

  it("does not authorize rules when the group could not be created", async () => {
    const error = { code: "InvalidVpcID.NotFound", message: "not found", requestId: null };
    client.createSecurityGroup.mockResolvedValue({ ok: false, error });
    expect(await createSecurityGroupAction("web", "vpc-x", [ssh])).toEqual(error);
    expect(client.authorizeIngress).not.toHaveBeenCalled();
  });
});
