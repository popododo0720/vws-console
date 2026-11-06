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

describe.each(["Dockerfile", "Dockerfile.dev"])("%s", (dockerfile) => {
  const all = instructions(dockerfile);
  const install = all.findIndex((line) => /^RUN\b.*\bnpm\s+(ci|install)\b/i.test(line));

  it("installs dependencies", () => {
    expect(install).toBeGreaterThan(-1);
  });

  it.each(localDirs)("copies %s before the first npm install", (dir) => {
    const copy = all.findIndex((line) => copiesInPlace(line, dir));
    expect(copy, `${dockerfile} must COPY ${dir} before npm install`).toBeGreaterThan(-1);
    expect(copy, `${dockerfile} must COPY ${dir} before npm install`).toBeLessThan(install);
  });
});

it("finds the vendored braces dependency", () => {
  expect(localDirs).toContain("vendor/braces");
});
