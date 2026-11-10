import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = path.resolve(__dirname, "..");
const retired = /kubectl|rook-ceph|platform\/01-crds/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : [full];
  });
}

describe("retired Kubernetes installer", () => {
  it("has no installer route, component or library directory", () => {
    for (const dir of ["app/installer", "components/sites/installer", "lib/installer"]) {
      expect(existsSync(path.join(srcDir, dir))).toBe(false);
    }
  });

  it("leaves no Kubernetes installer wording under src", () => {
    const hits = sourceFiles(srcDir).filter((file) => file !== __filename && retired.test(readFileSync(file, "utf8")));
    expect(hits).toEqual([]);
  });
});
