import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { appendFileSync, chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { expect } from "@playwright/test";

export const stackRoot = resolve(".cache/e2e-stack/stack");
export const port = Number(process.env.E2E_STACK_PORT ?? 21700);
const apiPort = Number(process.env.E2E_STACK_API_PORT ?? 21710);
const regionPort = Number(process.env.E2E_STACK_REGION_PORT ?? 21720);
const pvePort = Number(process.env.E2E_STACK_PVE_PORT ?? 21730);
export const apiURL = `http://127.0.0.1:${apiPort}`;
export const origin = `http://127.0.0.1:${port}`;
export const regionEndpoint = `https://127.0.0.1:${regionPort}`;
export const regionReadyURL = `http://127.0.0.1:${regionPort + 1}/readyz`;
export const rootPassword = "stack-root-canary-176";
export const userPassword = "stack-user-canary-176";
const consoleToken = "stack-console-canary-176";
const adminKEK = Buffer.alloc(32, 176).toString("base64");
export const canaries = [rootPassword, userPassword, consoleToken, adminKEK];

export function assertNoSecrets(text: string, secrets: string[], source: string) {
  for (const [index, secret] of secrets.entries()) {
    expect(text.includes(secret), `${source}: secret canary ${index} leaked`).toBe(false);
  }
}

export default async function setup() {
  const repo = resolve(process.env.VWS_CONSOLE_API_DIR ?? "../vws-console-api");
  const children: ChildProcess[] = [];
  const logs: string[] = [];
  const file = (name: string) => resolve(stackRoot, name);
  rmSync(stackRoot, { recursive: true, force: true });
  mkdirSync(stackRoot, { recursive: true });
  for (const value of [
    port,
    apiPort,
    apiPort + 1,
    apiPort + 2,
    apiPort + 3,
    apiPort + 4,
    regionPort,
    regionPort + 1,
    pvePort,
  ]) {
    expect(Number.isInteger(value) && value > 1024 && value < 32768, `invalid stack port: ${value}`).toBe(true);
  }
  const scenario = readFileSync(resolve(repo, "cmd/pvefake/testdata/scenario.yaml"), "utf8");
  const token = scenario.match(/^tokens:\n\s+- id: (\S+)\n\s+secret: (\S+)$/m);
  const tokenId = token?.[1];
  const tokenSecret = token?.[2];
  expect(tokenId, "scenario token ID").toBeTruthy();
  expect(tokenSecret, "scenario token secret").toBeTruthy();
  const secrets = [...canaries, tokenSecret!];
  const start = (name: string, command: string, args: string[], cwd = process.cwd()) => {
    const log = file(`${name}.log`);
    writeFileSync(log, "");
    logs.push(log);
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        OTEL_EXPORTER_OTLP_ENDPOINT: "",
        CREDENTIALS_DIRECTORY: stackRoot,
        VWS_CONSOLE_API_URL: apiURL,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    for (const stream of [child.stdout, child.stderr]) {
      stream?.on("data", (data: Buffer) => appendFileSync(log, data));
    }
    return child;
  };
  const run = async (name: string, command: string, args: string[], cwd?: string) => {
    const child = start(name, command, args, cwd);
    const [code] = await once(child, "close");
    expect(code, `${name} failed; see ${file(`${name}.log`)}`).toBe(0);
  };
  const ready = async (url: string) => {
    await expect
      .poll(
        async () => {
          const dead = children.find((child) => child.exitCode !== null && child.exitCode !== 0);
          expect(dead, "stack process exited; inspect .cache/e2e-stack/stack/*.log").toBeUndefined();
          return fetch(url, { signal: AbortSignal.timeout(1000) })
            .then((response) => response.status)
            .catch(() => 0);
        },
        { timeout: 180_000 },
      )
      .toBe(200);
  };
  const stop = async () => {
    for (const child of [...children].reverse()) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      const exited = once(child, "close");
      child.kill("SIGTERM");
      const deadline = setTimeout(() => child.kill("SIGKILL"), 10_000);
      await exited;
      clearTimeout(deadline);
    }
    for (const log of logs) assertNoSecrets(readFileSync(log, "utf8"), secrets, log);
  };
  try {
    for (const binary of ["pvefake", "vws-region-helper", "vws-region", "vws-console-api"]) {
      await run(`build-${binary}`, "go", ["build", "-o", file(binary), `./cmd/${binary}`], repo);
    }
    await run("console-build", "npm", ["run", "build"]);
    for (const directory of ["etc/pve/vws", "etc/pve/priv/vws", "etc/pve/priv/lock/vws-region", "snippets"]) {
      mkdirSync(file(directory), { recursive: true, mode: 0o700 });
    }
    const save = (name: string, contents: string | Buffer) => writeFileSync(file(name), contents, { mode: 0o600 });
    save("region-kek", Buffer.alloc(32, 42));
    save("admin-kek", adminKEK);
    save("root-password", rootPassword);
    save("region.yaml", "read_only: true\npools:\n  project: '123456789012'\n");
    await run("certificates", "openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=stack-loopback",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
      "-addext",
      "extendedKeyUsage=serverAuth,clientAuth",
      "-keyout",
      file("key.pem"),
      "-out",
      file("cert.pem"),
    ]);
    chmodSync(file("key.pem"), 0o600);
    const pve = start("pvefake", file("pvefake"), [
      "-scenario",
      resolve(repo, "cmd/pvefake/testdata/scenario.yaml"),
      "-listen",
      `127.0.0.1:${pvePort}`,
      "-ca-file",
      file("pve-ca.pem"),
    ]);
    const lines = createInterface({ input: pve.stdout! });
    const [pveURL] = await Promise.race([
      once(lines, "line"),
      once(pve, "exit").then(() => {
        throw new Error("pvefake exited before readiness");
      }),
    ]);
    lines.close();
    expect(pveURL).toBe(`https://127.0.0.1:${pvePort}`);
    writeFileSync(file("registration.json"), JSON.stringify({ pveURL, tokenId, tokenSecret }), { mode: 0o600 });
    start("region", file("vws-region"), [
      "-config",
      file("region.yaml"),
      "-registration-file",
      file("etc/pve/vws/registration.json"),
      "-helper-path",
      file("vws-region-helper"),
      "-helper-root",
      stackRoot,
      "-pve-endpoint",
      pveURL as string,
      "-pve-ca-file",
      file("pve-ca.pem"),
      "-tls-cert-file",
      file("cert.pem"),
      "-tls-key-file",
      file("key.pem"),
      "-tls-ca-file",
      file("cert.pem"),
      "-region-addr",
      `127.0.0.1:${regionPort}`,
      "-ops-addr",
      `127.0.0.1:${regionPort + 1}`,
    ]);
    await ready(`http://127.0.0.1:${regionPort + 1}/healthz`);
    start("global", file("vws-console-api"), [
      "-backend",
      "regions",
      "-admin-store",
      "memory",
      "-admin-kek-file",
      file("admin-kek"),
      "-region-mtls-ca-file",
      file("cert.pem"),
      "-region-mtls-cert-file",
      file("cert.pem"),
      "-region-mtls-key-file",
      file("key.pem"),
      "-iam",
      "fake",
      "-root-password-file",
      file("root-password"),
      "-console-token",
      consoleToken,
      "-access-key",
      "stack-key",
      "-secret",
      "stack-key-secret",
      "-console-origins",
      origin,
      "-console-addr",
      `127.0.0.1:${apiPort}`,
      "-ec2-addr",
      `127.0.0.1:${apiPort + 1}`,
      "-s3-addr",
      `127.0.0.1:${apiPort + 2}`,
      "-ops-addr",
      `127.0.0.1:${apiPort + 3}`,
      "-iam-addr",
      `127.0.0.1:${apiPort + 4}`,
    ]);
    await ready(`http://127.0.0.1:${apiPort + 3}/readyz`);
    for (const data of [
      "Action=CreateUser&UserName=stack-user",
      `Action=CreateLoginProfile&UserName=stack-user&Password=${userPassword}&PasswordResetRequired=false`,
    ]) {
      await run(`iam-${data.split("&")[0]}`, "curl", [
        "--fail-with-body",
        "--silent",
        "--show-error",
        "--max-time",
        "10",
        "--aws-sigv4",
        "aws:amz:us-east-1:iam",
        "--user",
        "stack-key:stack-key-secret",
        "-H",
        "Content-Type: application/x-www-form-urlencoded",
        "--data",
        `${data}&Version=2010-05-08`,
        `http://127.0.0.1:${apiPort + 4}/`,
      ]);
    }
    start("console", "node", ["server/console-server.mts", "-p", String(port), "-H", "127.0.0.1"]);
    await ready(`${origin}/login`);
    return stop;
  } catch (error) {
    await stop();
    throw error;
  }
}
