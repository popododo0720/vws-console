import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// The fake console-api (fake-console-api.mts) holds a running and a stopped instance and a volume in a Proxmox region
// that takes writes and in the AWS region. POST /__compute resets them, holds operations in "running" and answers
// every compute write it received with the X-Vws-Region it carried. Each case runs at a desktop and a phone width.
const api = `http://127.0.0.1:${process.env.E2E_FAKE_API_PORT ?? 43321}`;
const regions = [
  { name: "pve-lab-2", n: 1, terminatedRows: 0, afterTerminate: "drops the row from the list" },
  { name: "ap-northeast-2", n: 2, terminatedRows: 1, afterTerminate: "leaves the row, as Terminated" },
];

const control = async (request: APIRequestContext, data: { reset?: boolean; hold?: boolean } = {}): Promise<string[]> =>
  (await (await request.post(`${api}/__compute`, { data })).json()).seen;

async function stateEntry(page: Page, id: string, name: string) {
  await page.getByRole("checkbox", { name: `Select ${id}` }).check();
  await page
    .getByRole("button", { name: /^Instance state/ })
    .first()
    .click();
  return page.getByRole("menuitem", { name });
}

for (const region of regions) {
  for (const width of [1440, 390]) {
    test.describe(`actions in ${region.name} at ${width}px`, () => {
      test.use({ viewport: { width, height: 900 } });
      const running = `i-${region.n}0000001`;
      const volume = `vol-${region.n}0000001`;
      const query = `?region=${region.name}`;
      const sent = (write: string) => [
        `POST ${write} ${region.name}`,
        expect.stringMatching(new RegExp(`^GET /operations/op-\\d+ ${region.name}$`)),
      ];

      test.beforeEach(async ({ page, baseURL, request }) => {
        await control(request, { reset: true, hold: false });
        const cookies = ["vws_session", "vws_csrf"].map((name) => ({ name, value: "alice", url: baseURL }));
        await page.context().addCookies(cookies);
      });

      test("Stop, Start and Reboot send the region and show the operation state", async ({ page, request }) => {
        await page.goto(`/compute/instances${query}`);
        const row = page.getByRole("row").filter({ hasText: running });
        const status = page.getByRole("status");
        await (await stateEntry(page, running, "Stop instance")).click();
        await expect(status).toHaveText(`Successfully stopped ${running}`);
        await expect(row).toContainText("Stopped");
        await (await stateEntry(page, running, "Start instance")).click();
        await expect(status).toHaveText(`Successfully started ${running}`);
        await expect(row).toContainText("Running");
        await control(request, { hold: true });
        await (await stateEntry(page, running, "Reboot instance")).dblclick();
        await expect(status).toHaveText(`Rebooting ${running}…`);
        await control(request, { hold: false });
        await expect(status).toHaveText(`Successfully rebooted ${running}`);
        expect(await control(request)).toEqual([
          ...sent("/instances/stop"),
          ...sent("/instances/start"),
          ...sent(`/instances/${running}/reboot`),
        ]);
      });

      test("a Reboot that console-api refuses shows the error state", async ({ page, request }) => {
        await page.goto(`/compute/instances${query}`);
        const reboot = await stateEntry(page, running, "Reboot instance");
        // Another session stops the instance after this page listed it as running.
        const headers = { cookie: "__Host-vws_session=bob", "x-csrf-token": "bob", origin: api };
        const stop = { headers: { ...headers, "x-vws-region": region.name }, data: { instanceIds: [running] } };
        expect((await request.post(`${api}/api/v1/instances/stop`, stop)).status()).toBe(202);
        await reboot.click();
        const alert = page.getByRole("alert").filter({ hasText: "The instance action failed" });
        await expect(alert).toContainText("instance cannot be rebooted from stopping");
        await expect(alert).toContainText("Conflict · Request ID req-e2e");
        await expect(page.getByRole("status")).toBeEmpty();
      });

      test("a reload while an operation runs shows the instance state and sends nothing again", async ({
        page,
        request,
      }) => {
        await page.goto(`/compute/instances${query}`);
        await control(request, { hold: true });
        await (await stateEntry(page, running, "Stop instance")).click();
        await expect(page.getByRole("status")).toHaveText(`Stopping ${running}…`);
        await page.reload();
        await expect(page.getByRole("row").filter({ hasText: running })).toContainText("Stopping");
        const writes = (await control(request)).filter((line) => line.startsWith("POST"));
        expect(writes).toEqual([`POST /instances/stop ${region.name}`]);
      });

      test(`Terminate ${region.afterTerminate}`, async ({ page, request }) => {
        await page.goto(`/compute/instances${query}`);
        const row = page.getByRole("row").filter({ hasText: running });
        await (await stateEntry(page, running, "Terminate (delete) instance")).click();
        await expect(page.getByRole("status")).toHaveText(`Successfully terminated ${running}`);
        await expect(row).toHaveCount(region.terminatedRows);
        await expect(row.filter({ hasText: "Terminated" })).toHaveCount(region.terminatedRows);
        await expect(page.getByRole("row").filter({ hasText: "batch" })).toHaveCount(1);
        expect(await control(request)).toEqual(sent("/instances/terminate"));
      });

      test("Launch sends the region once for a double click and lists the instance", async ({ page, request }) => {
        await page.goto(`/compute/launch${query}`);
        await page.getByLabel("Name", { exact: true }).fill("launched");
        const noKey = { label: "Proceed without a key pair (Not recommended)" };
        await page.getByRole("combobox", { name: "Key pair name" }).selectOption(noKey);
        await page.getByRole("checkbox", { name: /^I acknowledge/ }).check();
        await control(request, { hold: true });
        await page.getByRole("button", { name: "Launch instance" }).dblclick();
        await expect(page.getByRole("button", { name: "Launching…" })).toBeDisabled();
        await control(request, { hold: false });
        await expect(page.getByRole("row").filter({ hasText: "launched" })).toContainText("Running");
        expect(new URL(page.url()).search).toBe(query);
        expect(await control(request)).toEqual(sent("/instances"));
      });

      test("Create snapshot sends the region once for a double click and lists it", async ({ page, request }) => {
        await page.goto(`/storage/volumes${query}`);
        await page.getByRole("checkbox", { name: `Select ${volume}` }).check();
        await page.getByRole("button", { name: /^Actions/ }).click();
        await page.getByRole("menuitem", { name: "Create snapshot", exact: true }).click();
        await expect(page.getByLabel("Volume ID")).toHaveValue(volume);
        await page.getByLabel("Description").fill("before upgrade");
        await control(request, { hold: true });
        await page.getByRole("button", { name: "Create snapshot" }).dblclick();
        await expect(page.getByRole("status")).toHaveText(`Creating a snapshot of ${volume}…`);
        await control(request, { hold: false });
        await expect(page.getByRole("row").filter({ hasText: "before upgrade" })).toContainText(volume);
        expect(new URL(page.url()).search).toBe(query);
        expect(await control(request)).toEqual(sent("/snapshots"));
      });
    });
  }
}
