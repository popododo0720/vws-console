import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InstallerWizard, ISCSI_NOTICE } from "@/components/sites/installer/installer-wizard";
import { MOCK_CREDENTIAL, createMockInstaller } from "@/lib/installer/mock-client";

const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const heading = () => screen.getByRole("heading", { level: 1 }).textContent;

function toStorage() {
  render(<InstallerWizard api={createMockInstaller()} />);
  next();
  fireEvent.change(screen.getByLabelText("Tunnel NIC"), { target: { value: "enp1s0" } });
  fireEvent.change(screen.getByLabelText("External NIC"), { target: { value: "enp1s0" } });
  next();
  expect(heading()).toBe("Storage");
}

describe("installer wizard", () => {
  it("shows the sample badge and blocks later steps until earlier ones are valid", () => {
    render(<InstallerWizard api={createMockInstaller()} />);
    expect(screen.getByText("Sample data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Step 3: Storage/ })).toBeDisabled();
    next();
    next();
    expect(heading()).toBe("Network");
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual(["Choose a NIC.", "Choose a NIC."]);
  });

  it("lists MinIO and local as disabled with the iSCSI notice", () => {
    toStorage();
    expect(screen.getByLabelText(/MinIO/)).toBeDisabled();
    expect(screen.getByLabelText(/^Local/)).toBeDisabled();
    expect(screen.getAllByText("Coming soon")).toHaveLength(2);
    expect(screen.getByRole("note")).toHaveTextContent(ISCSI_NOTICE);
  });

  it("validates NFS server and export path", () => {
    toStorage();
    fireEvent.click(screen.getByLabelText("NFS"));
    fireEvent.change(screen.getByLabelText(/NFS server/), { target: { value: "nas.example.internal" } });
    fireEvent.change(screen.getByLabelText(/Export path/), { target: { value: "exports" } });
    next();
    expect(heading()).toBe("Storage");
    expect(screen.getByRole("alert")).toHaveTextContent("The export path must be absolute");
    fireEvent.change(screen.getByLabelText(/Export path/), { target: { value: "/exports/vws" } });
    next();
    expect(heading()).toBe("Elastic IPs");
  });

  it("requires an existing StorageClass for generic CSI", () => {
    toStorage();
    fireEvent.click(screen.getByLabelText(/Generic CSI/));
    next();
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a StorageClass.");
    fireEvent.change(screen.getByLabelText(/^StorageClass/), { target: { value: "example-csi-block" } });
    fireEvent.change(screen.getByLabelText(/Volume mode/), { target: { value: "Filesystem" } });
    next();
    expect(heading()).toBe("Elastic IPs");
  });

  it("runs to completion and shows the credential once without browser storage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    toStorage();
    next();
    next();
    expect(screen.getByRole("alert")).toHaveTextContent("It has no default");
    fireEvent.change(screen.getByLabelText(/EIP pool/), { target: { value: "203.0.113.0/28" } });
    next();
    next();
    next();
    expect(heading()).toBe("Review and install");
    const cr = JSON.parse(screen.getByLabelText("VWSCluster").textContent ?? "");
    expect(cr.spec.network.nodes.external).toEqual({ nic: "enp1s0", eipPool: "203.0.113.0/28" });
    expect(cr.spec.storage).toEqual({ driver: "rook-ceph" });
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(within(screen.getByRole("list", { name: "Install log" })).getAllByRole("listitem")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getAllByText("—")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Show once" }));
    expect(screen.getByText(MOCK_CREDENTIAL)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show once" })).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("mock installer contract", () => {
  it("rejects out-of-order steps and a second credential read", () => {
    const api = createMockInstaller();
    expect(() => api.putStep("eip", { eipPool: "203.0.113.0/28" })).toThrow("step_out_of_order");
    expect(api.takeCredential()).toBe(MOCK_CREDENTIAL);
    expect(() => api.takeCredential()).toThrow("credential_consumed");
  });
});
