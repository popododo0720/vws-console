import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket } from "../../../../test/fake-websocket";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { InstanceConnectView } from "@/components/sites/console/instance-connect-view";
import { awsRegion, loaded, pveLiveBox, pveWritable } from "@/lib/vws-api/testdata/capabilities";
import type { Instance } from "@/types/console";

/** The two browser libraries, cut down to what the page does with them. The websocket under them is the page's. */
const clients = vi.hoisted(() => {
  class Rfb extends EventTarget {
    static made: Rfb[] = [];
    scaleViewport = false;
    background = "";
    disconnect = vi.fn();
    focus = vi.fn();

    constructor(
      readonly host: HTMLElement,
      readonly channel: unknown,
    ) {
      super();
      Rfb.made.push(this);
    }

    emit(type: string, detail: object = {}) {
      this.dispatchEvent(new CustomEvent(type, { detail }));
    }
  }

  class Terminal {
    static made: Terminal[] = [];
    written: (string | Uint8Array)[] = [];
    type: (keys: string) => void = () => undefined;
    open = vi.fn();
    focus = vi.fn();
    dispose = vi.fn();

    constructor() {
      Terminal.made.push(this);
    }

    write(data: string | Uint8Array) {
      this.written.push(data);
    }

    onData(listener: (keys: string) => void) {
      this.type = listener;
    }
  }

  return { Rfb, Terminal };
});

vi.mock("@novnc/novnc", () => ({ default: clients.Rfb }));
vi.mock("@xterm/xterm", () => ({ Terminal: clients.Terminal }));
vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/compute/instances/i-0123456789abcdef0/connect",
  useSearchParams: () => new URLSearchParams(),
}));

const ID = "i-0123456789abcdef0";
const instance: Instance = {
  ...{ id: ID, name: "web", state: "running", type: "", status: "none", checksPassed: 0, checksTotal: 0, region: "" },
  ...{ availabilityZone: "", publicDns: "", publicIpv4: "", privateIpv4: "", privateDns: "", elasticIp: "" },
  ...{ publicIpAllocationId: "", ipv6: "", vpcId: "", subnetId: "", keyPair: "", imageId: "", launchedAt: "" },
};

type Props = ComponentProps<typeof InstanceConnectView>;
const show = (doc: unknown, props: Partial<Props> = {}) =>
  render(
    <ConsoleProvider capabilities={loaded(doc)}>
      <InstanceConnectView id={ID} instance={instance} loadError={null} {...props} />
    </ConsoleProvider>,
  );
const tab = (name: string) => screen.getByRole("tab", { name });
const connect = () => screen.getByRole("button", { name: "Connect" });
const status = () => screen.getByRole("status");
const bytes = (text: string) => new TextEncoder().encode(text);

/** Chooses Connect and resolves with the websocket that session opens. */
function start(): Promise<FakeWebSocket> {
  const opened = FakeWebSocket.next();
  fireEvent.click(connect());
  return opened;
}

describe("Connect to instance", () => {
  beforeEach(() => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    FakeWebSocket.reset();
    clients.Rfb.made = [];
    clients.Terminal.made = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["an AWS region", awsRegion, "use EC2 Instance Connect"],
    ["a read-only Proxmox region", pveLiveBox, "read-only"],
  ])("disables both tabs and Connect in %s, with its reason, and opens no websocket", (_case, doc, reason) => {
    show(doc);
    for (const control of [tab("VNC console"), tab("Serial console"), connect()]) {
      expect(control).toBeDisabled();
      expect(control).toHaveAccessibleDescription(reason);
      fireEvent.click(control);
    }
    expect(screen.getByRole("alert")).toHaveTextContent(reason);
    expect(status()).toHaveTextContent("Not connected");
    expect(FakeWebSocket.opened).toEqual([]);
    expect([clients.Rfb.made, clients.Terminal.made]).toEqual([[], []]);
  });

  it("opens the serial console on its own websocket: bytes in go to the terminal, keys go out as bytes", async () => {
    show(pveWritable);
    fireEvent.click(tab("Serial console"));
    const socket = await start();
    expect(socket.url).toBe(`ws://localhost:3000/api/v1/instances/${ID}/console?kind=serial`);
    expect(socket.binaryType).toBe("arraybuffer");
    expect(status()).toHaveTextContent("Connecting…");
    expect(connect()).toBeDisabled();
    act(() => socket.open());
    expect(status()).toHaveTextContent("Connected");
    const [terminal] = clients.Terminal.made;
    socket.receive(bytes("hello from serial0\r\n").buffer);
    socket.receive("a text frame");
    const written = terminal.written.map((data) =>
      typeof data === "string" ? { text: data } : { bytes: new TextDecoder().decode(data) },
    );
    expect(written).toEqual([{ bytes: "hello from serial0\r\n" }, { text: "a text frame" }]);
    terminal.type("ls\r");
    expect(socket.send).toHaveBeenCalledExactlyOnceWith(bytes("ls\r"));
  });

  it("shows the reason and Reconnect when the websocket fails; Reconnect opens a new one, unmount closes it", async () => {
    const reported = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const view = show(pveWritable);
    fireEvent.click(tab("Serial console"));
    const first = await start();
    act(() => first.fail());
    expect(status()).toHaveTextContent("Disconnected");
    expect(screen.getByRole("alert")).toHaveTextContent("The connection to the console failed.");
    expect(first.close).toHaveBeenCalled();
    expect(reported).toHaveBeenCalledWith(
      "[vws-console]",
      expect.objectContaining({ context: "instance-connect-serial", code: "ConsoleDisconnected" }),
    );
    const opened = FakeWebSocket.next();
    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    const second = await opened;
    expect(second).not.toBe(first);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(status()).toHaveTextContent("Connecting…");
    act(() => second.open());
    expect(second.close).not.toHaveBeenCalled();
    view.unmount();
    expect(second.close).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.opened).toHaveLength(2);
  });

  it("closes the websocket when the other tab is chosen, and that tab starts not connected", async () => {
    show(pveWritable);
    const socket = await start();
    fireEvent.click(tab("Serial console"));
    expect(socket.close).toHaveBeenCalled();
    expect(clients.Rfb.made[0].disconnect).toHaveBeenCalledTimes(1);
    expect(tab("Serial console")).toHaveAttribute("aria-selected", "true");
    expect(status()).toHaveTextContent("Not connected");
    expect(FakeWebSocket.opened).toHaveLength(1);
  });

  it("gives noVNC the page's websocket and is connected only after the RFB handshake", async () => {
    show(pveWritable);
    const socket = await start();
    expect(socket.url).toBe(`ws://localhost:3000/api/v1/instances/${ID}/console?kind=vnc`);
    const [rfb] = clients.Rfb.made;
    expect(rfb.channel).toBe(socket);
    act(() => socket.open());
    expect(status()).toHaveTextContent("Connecting…");
    act(() => rfb.emit("connect"));
    expect(status()).toHaveTextContent("Connected");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    ["credentialsrequired", { types: ["password"] }, "asked for a password"],
    ["securityfailure", { status: 1, reason: "Too many attempts" }, "refused the connection: Too many attempts"],
    ["disconnect", { clean: false }, "ended unexpectedly"],
  ])("ends the VNC session with a reason and closes the websocket on noVNC's %s", async (type, detail, reason) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    show(pveWritable);
    const socket = await start();
    act(() => clients.Rfb.made[0].emit(type, detail));
    expect(screen.getByRole("alert")).toHaveTextContent(reason);
    expect(status()).toHaveTextContent("Disconnected");
    expect(socket.close).toHaveBeenCalled();
  });

  it("opens no websocket for an instance whose ID breaks the rule, and says so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    show(pveWritable, { instance: { ...instance, id: `${ID}/../../admin` } });
    fireEvent.click(connect());
    expect(await screen.findByText("The instance ID is not valid.")).toBeInTheDocument();
    expect(FakeWebSocket.opened).toEqual([]);
  });

  it("shows a load error or a missing instance in place of the tabs", () => {
    const failed = { code: "ServiceUnavailable", message: "The VWS console API did not answer.", requestId: "req-9" };
    const view = show(pveWritable, { instance: null, loadError: failed });
    expect(screen.getByRole("alert")).toHaveTextContent("ServiceUnavailable · Request ID req-9");
    expect(screen.queryByRole("tablist")).toBeNull();
    view.unmount();
    show(pveWritable, { instance: null });
    expect(screen.getByRole("alert")).toHaveTextContent(`${ID} is not in this region.`);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("button", { name: "Connect" })).toBeNull();
  });
});
