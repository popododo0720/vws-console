import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as PackageJson;

const localDirs = Object.values({ ...pkg.dependencies, ...pkg.devDependencies })
  .filter((spec) => spec.startsWith("file:"))
  .map((spec) => spec.slice("file:".length).replace(/\/$/, ""));

function instructions(dockerfile: string): string[] {
  return readFileSync(join(root, dockerfile), "utf8")
    .replace(/\\\r?\n/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

function contextPath(path: string): string {
  return path.replace(/^\.\//, "").replace(/\/$/, "") || ".";
}

function copiesInPlace(instruction: string, dir: string): boolean {
  const [keyword, ...args] = instruction.split(/\s+/);
  if (keyword.toUpperCase() !== "COPY" || args.some((arg) => arg.startsWith("--from"))) return false;
  const paths = args.filter((arg) => !arg.startsWith("--"));
  const dest = paths.pop();
  if (dest === undefined || dest.startsWith("/")) return false;
  return paths
    .map(contextPath)
    .some(
      (source) => source === contextPath(dest) && (source === "." || source === dir || dir.startsWith(`${source}/`)),
    );
}

function installsWithout(all: string[], dir: string): { installs: number; missing: string[] } {
  let workdir = "/";
  let landedIn: string | null = null;
  let installs = 0;
  const missing: string[] = [];
  for (const line of all) {
    const [keyword, arg = ""] = line.split(/\s+/);
    switch (keyword.toUpperCase()) {
      case "FROM":
        workdir = "/";
        landedIn = null;
        break;
      case "WORKDIR":
        workdir = arg.startsWith("/") ? arg : `${workdir.replace(/\/$/, "")}/${arg}`;
        break;
      case "COPY":
        if (copiesInPlace(line, dir)) landedIn = workdir;
        break;
      case "RUN":
        if (/\bnpm\s+(ci|install)\b/.test(line)) {
          installs++;
          if (landedIn !== workdir) missing.push(line);
        }
        break;
    }
  }
  return { installs, missing };
}

describe.each(["Dockerfile", "Dockerfile.dev"])("%s", (dockerfile) => {
  const all = instructions(dockerfile);

  it.each(localDirs)("has %s in the stage and WORKDIR of every npm install", (dir) => {
    const { installs, missing } = installsWithout(all, dir);
    expect(installs).toBeGreaterThan(0);
    expect(missing, `${dockerfile} must COPY ${dir} into WORKDIR before npm install`).toEqual([]);
  });
});

it("finds the vendored braces dependency", () => {
  expect(localDirs).toContain("vendor/braces");
});
