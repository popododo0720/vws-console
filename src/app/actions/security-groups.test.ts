import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngressPermission, SecurityGroup } from "@/types/console";
import { toSecurityGroup, type ApiResult } from "@/lib/vws-api/adapter";

const api = vi.hoisted(() => ({
  listSecurityGroups: vi.fn(),
  authorizeIngress: vi.fn(),
  revokeIngress: vi.fn(),
  createSecurityGroup: vi.fn(),
  deleteSecurityGroup: vi.fn(),
}));
vi.mock("@/lib/vws-api/client", () => api);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createSecurityGroupAction, deleteSecurityGroupsAction, saveInboundRulesAction } from "@/app/actions/resources";

const GROUP = "sg-0123456789abcdef0";
const tcp = (port: number): IngressPermission => ({
  ipProtocol: "tcp",
  fromPort: port,
  toPort: port,
  cidrIp: "0.0.0.0/0",
});
const ok = <T>(value: T): ApiResult<T> => ({ ok: true, value });
const fail = (code: string): ApiResult<void> => ({ ok: false, error: { code, message: code, requestId: "req-1" } });

/** An in-memory console-api: equal values are the same rule, as in the real backend. */
let groups: Map<string, IngressPermission[]>;
const same = (a: IngressPermission, b: IngressPermission) => JSON.stringify(a) === JSON.stringify(b);

beforeEach(() => {
  vi.clearAllMocks();
  groups = new Map([[GROUP, [tcp(22), tcp(80)]]]);
  api.listSecurityGroups.mockImplementation(async () =>
    ok<SecurityGroup[]>(
      [...groups].map(([groupId, rules]) =>
        toSecurityGroup({ groupId, groupName: "web", vpcId: "vpc-1", ipPermissions: rules }),
      ),
    ),
  );
  api.authorizeIngress.mockImplementation(async (id: string, add: IngressPermission[]) => {
    const rules = groups.get(id)!;
    if (add.some((rule) => rules.some((have) => same(have, rule)))) return fail("InvalidPermission.Duplicate");
    rules.push(...add);
    return ok(undefined);
  });
  api.revokeIngress.mockImplementation(async (id: string, rule: IngressPermission) => {
    const rules = groups.get(id)!;
    const index = rules.findIndex((have) => same(have, rule));
    if (index < 0) return fail("InvalidPermission.NotFound");
    rules.splice(index, 1);
    return ok(undefined);
  });
  api.deleteSecurityGroup.mockImplementation(async (id: string) =>
    groups.delete(id) ? ok(undefined) : fail("InvalidGroup.NotFound"),
  );
});

const changes = { remove: [tcp(80)], add: [tcp(443)] };

describe("saveInboundRulesAction", () => {
  it("deletes and adds the changed rules", async () => {
    expect(await saveInboundRulesAction(GROUP, changes)).toBeNull();
    expect(groups.get(GROUP)).toEqual([tcp(22), tcp(443)]);
  });

  it("adds every new rule in one authorize call after the revokes, as the AWS console saves", async () => {
    const add = [tcp(443), tcp(8080)];
    expect(await saveInboundRulesAction(GROUP, { remove: [tcp(80)], add })).toBeNull();
    expect(api.authorizeIngress.mock.calls).toEqual([[GROUP, add]]);
    expect(api.revokeIngress.mock.invocationCallOrder[0]).toBeLessThan(
      api.authorizeIngress.mock.invocationCallOrder[0],
    );
    expect(groups.get(GROUP)).toEqual([tcp(22), tcp(443), tcp(8080)]);
  });

  it("names every rule of a refused authorize call, since console-api adds all or none", async () => {
    api.authorizeIngress.mockResolvedValueOnce(fail("ServiceUnavailable"));
    const error = await saveInboundRulesAction(GROUP, { remove: [], add: [tcp(443), tcp(8080)] });
    expect(error?.message).toBe(
      "Rules TCP 443 from 0.0.0.0/0; TCP 8080 from 0.0.0.0/0 were not added: ServiceUnavailable",
    );
    expect(groups.get(GROUP)).toEqual([tcp(22), tcp(80)]);
  });

  it("sends only the missing rules when a parallel save added some of them first", async () => {
    groups.get(GROUP)!.push(tcp(443));
    expect(await saveInboundRulesAction(GROUP, { remove: [], add: [tcp(443), tcp(8080)] })).toBeNull();
    expect(api.authorizeIngress.mock.calls).toEqual([[GROUP, [tcp(8080)]]]);
  });

  it("finishes a save when a parallel save adds part of its batch after the first read", async () => {
    const authorize = api.authorizeIngress.getMockImplementation()!;
    api.authorizeIngress.mockImplementationOnce(async (id: string, add: IngressPermission[]) => {
      groups.get(id)!.push(tcp(443));
      return authorize(id, add);
    });
    expect(await saveInboundRulesAction(GROUP, { remove: [tcp(80)], add: [tcp(443), tcp(8080)] })).toBeNull();
    expect(groups.get(GROUP)).toEqual([tcp(22), tcp(443), tcp(8080)]);
    expect(api.authorizeIngress.mock.calls.map(([, add]) => add)).toEqual([[tcp(443), tcp(8080)], [tcp(8080)]]);
  });

  it("names only the rules still missing when the narrowed authorize fails too", async () => {
    const authorize = api.authorizeIngress.getMockImplementation()!;
    api.authorizeIngress
      .mockImplementationOnce(async (id: string, add: IngressPermission[]) => {
        groups.get(id)!.push(tcp(443));
        return authorize(id, add);
      })
      .mockResolvedValueOnce(fail("ServiceUnavailable"));
    const error = await saveInboundRulesAction(GROUP, { remove: [], add: [tcp(443), tcp(8080)] });
    expect(error?.message).toBe(
      "Rule TCP 8080 from 0.0.0.0/0 was not added: ServiceUnavailable Already saved: added TCP 443 from 0.0.0.0/0.",
    );
    expect(api.authorizeIngress).toHaveBeenCalledTimes(2);
  });

  it("is safe to run twice, as on a double submit or a reload and save", async () => {
    expect(await saveInboundRulesAction(GROUP, changes)).toBeNull();
    expect(await saveInboundRulesAction(GROUP, changes)).toBeNull();
    expect(groups.get(GROUP)).toEqual([tcp(22), tcp(443)]);
    expect(api.revokeIngress).toHaveBeenCalledTimes(1);
    expect(api.authorizeIngress).toHaveBeenCalledTimes(1);
  });

  it("stops at a failure, says which rule failed, and finishes on retry", async () => {
    api.authorizeIngress.mockResolvedValueOnce(fail("ServiceUnavailable"));
    const error = await saveInboundRulesAction(GROUP, changes);
    expect(error).toMatchObject({ code: "ServiceUnavailable", requestId: "req-1" });
    expect(error?.message).toBe(
      "Rule TCP 443 from 0.0.0.0/0 was not added: ServiceUnavailable Already saved: deleted TCP 80 from 0.0.0.0/0.",
    );
    expect(groups.get(GROUP)).toEqual([tcp(22)]);
    expect(await saveInboundRulesAction(GROUP, changes)).toBeNull();
    expect(groups.get(GROUP)).toEqual([tcp(22), tcp(443)]);
  });

  it("counts a failed call as done when a fresh read shows it applied", async () => {
    api.revokeIngress.mockImplementationOnce(async () => {
      groups.set(GROUP, [tcp(22)]);
      return fail("RequestTimeout");
    });
    expect(await saveInboundRulesAction(GROUP, changes)).toBeNull();
    expect(groups.get(GROUP)).toEqual([tcp(22), tcp(443)]);
  });

  it("refuses bad input before it calls the API", async () => {
    const bad: [unknown, unknown][] = [
      ["sg-1; drop", changes],
      [GROUP, null],
      [GROUP, { remove: "all", add: [] }],
      [GROUP, { remove: [], add: [{ ipProtocol: "tcp", fromPort: 1, toPort: 99999, cidrIp: "0.0.0.0/0" }] }],
      [GROUP, { remove: [], add: Array.from({ length: 101 }, (_, port) => tcp(port)) }],
    ];
    for (const [id, input] of bad) {
      expect(await saveInboundRulesAction(id, input)).toMatchObject({ code: "InvalidParameterValue" });
    }
    expect(api.listSecurityGroups).not.toHaveBeenCalled();
  });

  it("reports a group that no longer exists", async () => {
    groups.clear();
    expect(await saveInboundRulesAction(GROUP, changes)).toMatchObject({ code: "InvalidGroup.NotFound" });
  });
});

describe("createSecurityGroupAction", () => {
  it("names the created group when a rule fails, so a retry does not create a second one blindly", async () => {
    const created = "sg-00000000000000001";
    groups.set(created, []);
    api.createSecurityGroup.mockResolvedValue(ok(created));
    api.authorizeIngress.mockResolvedValueOnce(fail("ServiceUnavailable"));
    const error = await createSecurityGroupAction("web", "vpc-0123456789abcdef0", [tcp(22)]);
    expect(error?.message).toMatch(/^Security group sg-00000000000000001 was created\. Rule TCP 22/);
  });

  it("refuses a bad name or VPC before it calls the API", async () => {
    expect(await createSecurityGroupAction("  ", "vpc-0123456789abcdef0", [])).toMatchObject({
      code: "InvalidParameterValue",
    });
    expect(await createSecurityGroupAction("web", "vpc-x", [])).toMatchObject({ code: "InvalidParameterValue" });
    expect(api.createSecurityGroup).not.toHaveBeenCalled();
  });
});

describe("deleteSecurityGroupsAction", () => {
  it("finishes a retry when an earlier run already deleted some groups", async () => {
    const other = "sg-0000000000000000a";
    groups.set(other, []);
    groups.delete(GROUP);
    expect(await deleteSecurityGroupsAction([GROUP, other])).toBeNull();
    expect(groups.size).toBe(0);
  });

  it("refuses IDs that are not security group IDs", async () => {
    expect(await deleteSecurityGroupsAction(["../vpcs/vpc-1"])).toMatchObject({ code: "InvalidParameterValue" });
    expect(await deleteSecurityGroupsAction([])).toMatchObject({ code: "InvalidParameterValue" });
    expect(api.deleteSecurityGroup).not.toHaveBeenCalled();
  });
});
