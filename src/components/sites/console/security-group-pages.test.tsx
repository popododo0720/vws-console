import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { supported } from "@/lib/vws-api/testdata/capabilities";
import { SecurityGroupDetailView } from "@/components/sites/console/security-group-detail-view";
import { SecurityGroupRulesEditView } from "@/components/sites/console/security-group-rules-edit-view";
import { SecurityGroupCreateView } from "@/components/sites/console/security-group-create-view";
import { toSecurityGroup } from "@/lib/vws-api/adapter";
import type { SecurityGroup } from "@/types/console";

const actions = vi.hoisted(() => ({
  saveInboundRulesAction: vi.fn(),
  deleteSecurityGroupsAction: vi.fn(),
  createSecurityGroupAction: vi.fn(),
}));
const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => actions);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
  usePathname: () => "/network/security-groups",
  useSearchParams: () => new URLSearchParams(),
}));

const GROUP_ID = "sg-0123456789abcdef0";
const group: SecurityGroup = toSecurityGroup({
  groupId: GROUP_ID,
  groupName: "web",
  vpcId: "vpc-0123456789abcdef0",
  ownerId: "123456789012",
  ipPermissions: [
    { ipProtocol: "tcp", fromPort: 22, toPort: 22, cidrIp: "0.0.0.0/0" },
    { ipProtocol: "icmp", fromPort: 3, toPort: 4, cidrIp: "10.0.0.0/8" },
  ],
});

const wrap = (node: React.ReactNode) => render(<ConsoleProvider capabilities={supported}>{node}</ConsoleProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  actions.saveInboundRulesAction.mockResolvedValue(null);
  actions.deleteSecurityGroupsAction.mockResolvedValue(null);
});

describe("Edit inbound rules", () => {
  const renderEdit = () =>
    wrap(<SecurityGroupRulesEditView id={GROUP_ID} direction="in" group={group} loadError={null} />);

  it("has nothing to save until a rule changes", () => {
    renderEdit();
    expect(screen.getByRole("button", { name: "Save rules" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Preview changes" }));
    expect(within(screen.getByRole("region", { name: "Preview changes" })).getByText("No changes")).toBeTruthy();
  });

  it("previews a changed rule as a delete and an add, and asks before it deletes", async () => {
    renderEdit();
    fireEvent.change(screen.getByLabelText("Rule 1 source"), { target: { value: "10.1.2.3/16" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview changes" }));
    const preview = screen.getByRole("region", { name: "Preview changes" });
    expect(within(preview).getByText("Rules to delete (1)")).toBeTruthy();
    expect(within(preview).getByText("TCP 22 from 0.0.0.0/0")).toBeTruthy();
    expect(within(preview).getByText("TCP 22 from 10.1.0.0/16")).toBeTruthy();
    expect(within(preview).getByText("Rules to add (1)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    const dialog = screen.getByRole("dialog", { name: "Delete inbound rules" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(actions.saveInboundRulesAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete and save" }));
    });
    expect(actions.saveInboundRulesAction).toHaveBeenCalledWith(GROUP_ID, {
      remove: [{ ipProtocol: "tcp", fromPort: 22, toPort: 22, cidrIp: "0.0.0.0/0" }],
      add: [{ ipProtocol: "tcp", fromPort: 22, toPort: 22, cidrIp: "10.1.0.0/16" }],
    });
    expect(push).toHaveBeenCalledWith(`/network/security-groups/${GROUP_ID}`);
  });

  it("saves an added rule without a delete confirmation and keeps the stored ICMP values", async () => {
    renderEdit();
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.change(screen.getByLabelText("Rule 3 type"), { target: { value: "https" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(actions.saveInboundRulesAction).toHaveBeenCalledWith(GROUP_ID, {
      remove: [],
      add: [{ ipProtocol: "tcp", fromPort: 443, toPort: 443, cidrIp: "0.0.0.0/0" }],
    });
  });

  it("keeps the ICMP type and code when only the source changes", async () => {
    renderEdit();
    fireEvent.change(screen.getByLabelText("Rule 2 source"), { target: { value: "192.168.0.0/16" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete and save" }));
    });
    expect(actions.saveInboundRulesAction).toHaveBeenCalledWith(GROUP_ID, {
      remove: [{ ipProtocol: "icmp", fromPort: 3, toPort: 4, cidrIp: "10.0.0.0/8" }],
      add: [{ ipProtocol: "icmp", fromPort: 3, toPort: 4, cidrIp: "192.168.0.0/16" }],
    });
  });

  it("re-reads the group after a partial failure and previews against what the API now holds", async () => {
    actions.saveInboundRulesAction.mockResolvedValue({
      code: "ServiceUnavailable",
      message: "Rule TCP 22 from 10.0.0.0/8 was not added: try later Already saved: deleted TCP 22 from 0.0.0.0/0.",
      requestId: "r1",
    });
    const { rerender } = renderEdit();
    fireEvent.change(screen.getByLabelText("Rule 1 source"), { target: { value: "10.0.0.0/8" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete and save" }));
    });
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByText(/Already saved: deleted TCP 22 from 0.0.0.0\/0/)).toBeTruthy();

    const afterRevoke = { ...group, rules: group.rules.slice(1) };
    rerender(
      <ConsoleProvider capabilities={supported}>
        <SecurityGroupRulesEditView id={GROUP_ID} direction="in" group={afterRevoke} loadError={null} />
      </ConsoleProvider>,
    );
    fireEvent.change(screen.getByLabelText("Rule 1 source"), { target: { value: "0.0.0.0/0" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview changes" }));
    const preview = screen.getByRole("region", { name: "Preview changes" });
    expect(within(preview).getByText("Rules to add (1)")).toBeTruthy();
    expect(within(preview).getByText("TCP 22 from 0.0.0.0/0")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save rules" })).toBeEnabled();
  });

  it("refuses a rule that repeats another", () => {
    renderEdit();
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    expect(screen.getByRole("alert").textContent).toBe("Rule 3 is the same as rule 1.");
    expect(actions.saveInboundRulesAction).not.toHaveBeenCalled();
  });

  it("shows the API error and stays on the page when the save fails", async () => {
    actions.saveInboundRulesAction.mockResolvedValue({
      code: "ServiceUnavailable",
      message: "Rule TCP 443 from 0.0.0.0/0 was not added: try again",
      requestId: "req-9",
    });
    renderEdit();
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.change(screen.getByLabelText("Rule 3 type"), { target: { value: "https" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    });
    expect(screen.getByText("The inbound rules could not be saved")).toBeTruthy();
    expect(screen.getByText(/req-9/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("Security group detail", () => {
  const renderDetail = () => wrap(<SecurityGroupDetailView id={GROUP_ID} group={group} loadError={null} />);

  it("shows the Sharing, VPC associations and Tags tabs as not reported by the API", () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Tags" }));
    expect(screen.getByText("The VWS API does not report security group tags yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "VPC associations" }));
    expect(screen.getByText(/does not report VPC associations yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sharing" }));
    expect(screen.getByText(/does not share security groups/)).toBeTruthy();
  });

  it("deletes only after the confirmation", async () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /^Actions/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete security groups" }));
    const dialog = screen.getByRole("dialog", { name: "Delete security groups" });
    expect(within(dialog).getByText(GROUP_ID)).toBeTruthy();
    expect(within(dialog).getByText(/does not report which instances use a security group/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(actions.deleteSecurityGroupsAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^Actions/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete security groups" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    });
    expect(actions.deleteSecurityGroupsAction).toHaveBeenCalledWith([GROUP_ID]);
    expect(push).toHaveBeenCalledWith("/network/security-groups");
  });

  it("keeps the dialog open with the error when the delete fails", async () => {
    actions.deleteSecurityGroupsAction.mockResolvedValue({
      code: "DependencyViolation",
      message: "resource sg-0123456789abcdef0 has a dependent object",
      requestId: "req-3",
    });
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /^Actions/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete security groups" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    });
    expect(within(screen.getByRole("dialog")).getByText(/has a dependent object/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows no flash on a plain visit", () => {
    renderDetail();
    expect(screen.queryByText(/successfully modified/)).toBeNull();
  });

  it("opens Copy to new security group with the source ID", () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /^Actions/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy to new security group" }));
    expect(push).toHaveBeenCalledWith(`/network/security-groups/create?copy=${GROUP_ID}`);
  });
});

describe("Save success flash", () => {
  const FLASH = `Inbound security group rules successfully modified on security group (${GROUP_ID} | web)`;
  const detail = <SecurityGroupDetailView key="detail" id={GROUP_ID} group={group} loadError={null} />;

  async function saveThenOpenDetail() {
    const view = wrap(<SecurityGroupRulesEditView id={GROUP_ID} direction="in" group={group} loadError={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.change(screen.getByLabelText("Rule 3 type"), { target: { value: "https" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    });
    view.rerender(<ConsoleProvider capabilities={supported}>{detail}</ConsoleProvider>);
    return view;
  }

  it("shows once on the group page after a save and lets it be dismissed", async () => {
    await saveThenOpenDetail();
    expect(screen.getByRole("status").textContent).toBe(`${FLASH}×`);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(FLASH)).toBeNull();
  });

  it("does not come back when the group page mounts again, as on Back or Forward", async () => {
    const view = await saveThenOpenDetail();
    expect(screen.getByText(FLASH)).toBeTruthy();
    view.rerender(<ConsoleProvider capabilities={supported}>{null}</ConsoleProvider>);
    view.rerender(<ConsoleProvider capabilities={supported}>{detail}</ConsoleProvider>);
    expect(screen.queryByText(FLASH)).toBeNull();
  });

  it("is not shown on another group's page", async () => {
    const view = wrap(<SecurityGroupRulesEditView id={GROUP_ID} direction="in" group={group} loadError={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.change(screen.getByLabelText("Rule 3 type"), { target: { value: "https" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    });
    const other = { ...group, id: "sg-0fedcba9876543210" };
    view.rerender(
      <ConsoleProvider capabilities={supported}>
        <SecurityGroupDetailView id={other.id} group={other} loadError={null} />
      </ConsoleProvider>,
    );
    expect(screen.queryByText(/successfully modified/)).toBeNull();
  });

  it("is not set when the save fails", async () => {
    actions.saveInboundRulesAction.mockResolvedValue({
      code: "InvalidGroup.NotFound",
      message: "gone",
      requestId: "r9",
    });
    await saveThenOpenDetail();
    expect(screen.queryByText(/successfully modified/)).toBeNull();
  });
});

describe("Copy to new security group", () => {
  it("starts with the source VPC and inbound rules and a blank name", async () => {
    actions.createSecurityGroupAction.mockResolvedValue(null);
    const vpcs = [
      { id: "vpc-aaaaaaaaaaaaaaaaa", name: "", ipv4Cidr: "10.9.0.0/16" },
      { id: "vpc-0123456789abcdef0", name: "main", ipv4Cidr: "10.0.0.0/16" },
    ] as unknown as Parameters<typeof SecurityGroupCreateView>[0]["vpcs"];
    wrap(<SecurityGroupCreateView vpcs={vpcs} loadError={null} source={group} sourceError={null} />);
    expect(screen.getByRole("status").textContent).toContain(GROUP_ID);
    expect(screen.getByLabelText("Rule 1 source")).toHaveValue("0.0.0.0/0");
    expect(screen.getByLabelText("Rule 2 source")).toHaveValue("10.0.0.0/8");
    fireEvent.change(document.querySelector("input.field")!, { target: { value: "web-copy" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create security group" }));
    });
    expect(actions.createSecurityGroupAction).toHaveBeenCalledWith("web-copy", "vpc-0123456789abcdef0", [
      { ipProtocol: "tcp", fromPort: 22, toPort: 22, cidrIp: "0.0.0.0/0" },
      { ipProtocol: "icmp", fromPort: 3, toPort: 4, cidrIp: "10.0.0.0/8" },
    ]);
  });
});
