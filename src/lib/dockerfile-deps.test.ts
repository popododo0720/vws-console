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

function copySources(line: string): string[] {
  const words = line.trim().split(/\s+/);
  if (words[0] !== "COPY" || words.some((word) => word.startsWith("--from"))) return [];
  return words
    .slice(1, -1)
    .filter((word) => !word.startsWith("--"))
    .map((word) => word.replace(/^\.\//, "").replace(/\/$/, ""));
}

function copies(line: string, dir: string): boolean {
  return copySources(line).some((source) => source === "." || source === dir || dir.startsWith(`${source}/`));
}

describe.each(["Dockerfile", "Dockerfile.dev"])("%s", (dockerfile) => {
  const all = readFileSync(join(root, dockerfile), "utf8").split("\n");
  const install = all.findIndex((line) => /\bnpm (ci|install)\b/.test(line));

  it("installs dependencies", () => {
    expect(install).toBeGreaterThan(-1);
  });

  it.each(localDirs)("copies %s before the first npm install", (dir) => {
    const copy = all.findIndex((line) => copies(line, dir));
    expect(copy, `${dockerfile} must COPY ${dir} before npm install`).toBeGreaterThan(-1);
    expect(copy, `${dockerfile} must COPY ${dir} before npm install`).toBeLessThan(install);
  });
});

it("finds the vendored braces dependency", () => {
  expect(localDirs).toContain("vendor/braces");
});
