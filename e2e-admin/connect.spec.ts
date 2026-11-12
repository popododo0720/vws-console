import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";

// The fake console-api (fake-console-api.mts) opens consoles in "pve-lab-2" and refuses them in the AWS region, as
// console-api does. Nothing serves the console websocket in this build (the console's relay is a separate change), so
// each test is its server through page.routeWebSocket. Each case runs at a desktop and a phone width.
const pve = { region: "pve-lab-2", id: "i-10000001" };
const aws = { region: "ap-northeast-2", id: "i-20000001" };
const connectPage = ({ region, id }: typeof pve) => `/compute/instances/${id}/connect?region=${region}`;
const SOCKETS = "**/api/v1/instances/*/console?kind=";

const signIn = (page: Page, baseURL: string | undefined) =>
  page.context().addCookies(["vws_session", "vws_csrf"].map((name) => ({ name, value: "alice", url: baseURL })));

const SCREEN = { width: 64, height: 48 };
/** The colour of the one frame the VNC server paints, as R, G, B. */
const FILL = [0, 108, 224];

function serverInit(): Buffer {
  const name = Buffer.from("vws-e2e");
  const init = Buffer.alloc(24 + name.length);
  init.writeUInt16BE(SCREEN.width, 0);
  init.writeUInt16BE(SCREEN.height, 2);
  init.set([32, 24, 0, 1], 4);
  for (const offset of [8, 10, 12]) init.writeUInt16BE(255, offset);
  init.set([16, 8, 0], 14);
  init.writeUInt32BE(name.length, 20);
  name.copy(init, 24);
  return init;
}

/** One FramebufferUpdate with a raw rectangle that fills the screen, in the pixel format noVNC asks for. */
function frame(): Buffer {
  const header = Buffer.alloc(16);
  header.writeUInt16BE(1, 2);
  header.writeUInt16BE(SCREEN.width, 8);
  header.writeUInt16BE(SCREEN.height, 10);
  const pixels = Buffer.alloc(SCREEN.width * SCREEN.height * 4);
  for (let at = 0; at < pixels.length; at += 4) pixels.set(FILL, at);
  return Buffer.concat([header, pixels]);
}

/**
 * An RFB 3.8 server with no security: the version, one security type, the result, ServerInit after ClientInit, and
 * the frame once the client has sent its first message as a connected client. `received` gets every client message.
 */
function vncServer(ws: WebSocketRoute, received: Buffer[]) {
  const replies = [
    { after: 12, send: () => Buffer.from([1, 1]) },
    { after: 1, send: () => Buffer.alloc(4) },
    { after: 1, send: serverInit },
    { after: 1, send: frame },
  ];
  let pending = 0;
  ws.send(Buffer.from("RFB 003.008\n"));
  ws.onMessage((message) => {
    const bytes = Buffer.from(message);
    received.push(bytes);
    pending += bytes.length;
    while (replies.length > 0 && pending >= replies[0].after) {
      const reply = replies.shift();
      if (!reply) return;
      pending = replies.length > 0 ? pending - reply.after : 0;
      ws.send(reply.send());
    }
  });
}

/**
 * Routes the VNC websocket to `serve`. noVNC takes a channel only when send, close and the on* handlers are members of
 * the object or of its own class. The WebSocket that routeWebSocket puts in the page keeps them on a parent class, so
 * they are copied down; a browser's own WebSocket needs nothing.
 */
async function routeVnc(page: Page, serve: (ws: WebSocketRoute) => void) {
  await page.routeWebSocket(`${SOCKETS}vnc`, serve);
  await page.addInitScript(() => {
    const own = WebSocket.prototype;
    const parent = Object.getPrototypeOf(own);
    for (const name of Object.getOwnPropertyNames(parent)) {
      const member = Object.getOwnPropertyDescriptor(parent, name);
      if (member && !Object.hasOwn(own, name)) Object.defineProperty(own, name, member);
    }
  });
}

const status = (page: Page) => page.getByRole("status");
const connect = (page: Page) => page.getByRole("button", { name: "Connect", exact: true });
const screenPixel = (page: Page) =>
  page
    .getByRole("tabpanel")
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => Array.from(canvas.getContext("2d")?.getImageData(1, 1, 1, 1).data ?? []));

for (const width of [1440, 390]) {
  test.describe(`Connect to instance at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test.beforeEach(async ({ page, baseURL }) => {
      await signIn(page, baseURL);
    });

    test("Connect on the instance page opens the page with its breadcrumb, heading, tabs and buttons", async ({
      page,
    }) => {
      await page.goto(`/compute/instances/${pve.id}?region=${pve.region}`);
      await page.getByRole("link", { name: "Connect", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/compute/instances/${pve.id}/connect\\?region=${pve.region}$`));
      await expect(page.getByRole("heading", { level: 1, name: "Connect to instance" })).toBeVisible();
      await expect(page.getByText(`Connect to your instance ${pve.id} (web) using any of these options`)).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveText(
        ["EC2", "Instances", pve.id, "Connect to instance"].join(""),
      );
      await expect(page.getByRole("tab", { name: "VNC console" })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tab", { name: "Serial console" })).toHaveAttribute("aria-selected", "false");
      await expect(status(page)).toHaveText("Not connected");
      await expect(connect(page)).toBeEnabled();
      await page.getByRole("link", { name: "Cancel" }).click();
      await expect(page).toHaveURL(new RegExp(`/compute/instances/${pve.id}\\?region=${pve.region}$`));
    });

    test("the VNC tab finishes the RFB handshake on one websocket and shows the frame the server paints", async ({
      page,
    }) => {
      const received: Buffer[] = [];
      let opened = 0;
      await routeVnc(page, (ws) => {
        opened += 1;
        vncServer(ws, received);
      });
      await page.goto(connectPage(pve));
      await connect(page).dblclick();
      await expect(status(page)).toHaveText("Connected");
      expect(received[0].toString()).toBe("RFB 003.008\n");
      await expect.poll(() => screenPixel(page)).toEqual([...FILL, 255]);
      expect(opened).toBe(1);
      await expect(connect(page)).toBeDisabled();
    });

    test("the serial tab shows the bytes the server sends and sends the keys typed", async ({ page }) => {
      const received: Buffer[] = [];
      await page.routeWebSocket(`${SOCKETS}serial`, (ws) => {
        ws.send(Buffer.from("hello from serial0\r\n"));
        ws.send("a text frame\r\n");
        ws.onMessage((message) => received.push(Buffer.from(message)));
      });
      await page.goto(connectPage(pve));
      await page.getByRole("tab", { name: "Serial console" }).click();
      await connect(page).click();
      await expect(status(page)).toHaveText("Connected");
      const rows = page.locator(".xterm-rows");
      await expect(rows).toContainText("hello from serial0");
      await expect(rows).toContainText("a text frame");
      // The terminal is 80 columns at any width: it scrolls inside its box, and the page does not scroll sideways.
      const pageScrollsSideways = await page.getByRole("tabpanel").evaluate((panel) => {
        let scroller = panel.parentElement;
        while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowX)) scroller = scroller.parentElement;
        return !scroller || scroller.scrollWidth > scroller.clientWidth;
      });
      expect(pageScrollsSideways).toBe(false);
      await page.keyboard.type("ls\r");
      await expect.poll(() => Buffer.concat(received).toString()).toBe("ls\r");
    });

    test("a websocket the server closes shows the reason, and Reconnect opens a new one", async ({ page }) => {
      const received: Buffer[] = [];
      let opened = 0;
      await routeVnc(page, (ws) => {
        opened += 1;
        if (opened === 1) ws.close({ code: 1011, reason: "console unavailable" });
        else vncServer(ws, received);
      });
      await page.goto(connectPage(pve));
      await connect(page).click();
      const alert = page.getByRole("alert").filter({ hasText: "The console connection ended" });
      await expect(alert).toContainText("console unavailable (code 1011)");
      await expect(status(page)).toHaveText("Disconnected");
      await alert.getByRole("button", { name: "Reconnect" }).click();
      await expect(status(page)).toHaveText("Connected");
      await expect(alert).toHaveCount(0);
      expect(opened).toBe(2);
    });

    test("a reload starts over, and the next Connect opens a new websocket", async ({ page }) => {
      let opened = 0;
      await routeVnc(page, (ws) => {
        opened += 1;
        vncServer(ws, []);
      });
      await page.goto(connectPage(pve));
      await connect(page).click();
      await expect(status(page)).toHaveText("Connected");
      await page.reload();
      await expect(status(page)).toHaveText("Not connected");
      expect(opened).toBe(1);
      await connect(page).click();
      await expect(status(page)).toHaveText("Connected");
      expect(opened).toBe(2);
    });

    test("with nothing answering the websocket, as in this build, Connect gives up after its timeout", async ({
      page,
    }) => {
      await page.clock.install();
      await page.goto(connectPage(pve));
      const socket = page.waitForEvent("websocket");
      await connect(page).click();
      await socket;
      await expect(status(page)).toHaveText("Connecting…");
      await page.clock.fastForward(15_000);
      const alert = page.getByRole("alert").filter({ hasText: "The console connection ended" });
      await expect(alert).toContainText("The console did not answer within 15 seconds.");
      await expect(alert.getByRole("button", { name: "Reconnect" })).toBeVisible();
      await expect(status(page)).toHaveText("Disconnected");
    });

    test("an AWS region disables Connect and both tabs with its reason, and opens no websocket", async ({ page }) => {
      let opened = 0;
      await page.routeWebSocket(`${SOCKETS}*`, () => {
        opened += 1;
      });
      await page.goto(`/compute/instances/${aws.id}?region=${aws.region}`);
      const action = connect(page);
      await expect(action).toBeDisabled();
      await expect(action).toHaveAccessibleDescription("use EC2 Instance Connect");
      await page.goto(connectPage(aws));
      await expect(page.getByRole("alert").filter({ hasText: "not available" })).toContainText(
        "use EC2 Instance Connect",
      );
      for (const name of ["VNC console", "Serial console"]) {
        const tab = page.getByRole("tab", { name });
        await expect(tab).toBeDisabled();
        await expect(tab).toHaveAccessibleDescription("use EC2 Instance Connect");
      }
      await page.getByRole("tab", { name: "Serial console" }).locator("xpath=..").hover();
      await expect(page.getByRole("tooltip")).toHaveText("use EC2 Instance Connect");
      await expect(page.getByRole("tooltip")).toBeInViewport({ ratio: 1 });
      await expect(connect(page)).toBeDisabled();
      await expect(page.getByRole("tabpanel").locator("canvas, .xterm")).toHaveCount(0);
      expect(opened).toBe(0);
    });

    test("an ID that is not an instance ID shows an error and no console", async ({ page }) => {
      await page.goto(`/compute/instances/not-an-id/connect?region=${pve.region}`);
      await expect(page.getByRole("alert").filter({ hasText: "The instance could not be loaded" })).toContainText(
        "The instance ID is not valid.",
      );
      await expect(page.getByRole("tablist")).toHaveCount(0);
      await expect(connect(page)).toHaveCount(0);
    });
  });
}
