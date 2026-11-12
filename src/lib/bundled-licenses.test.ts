import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { dependencies: Record<string, string> };

/** The libraries bundled into the browser code, and every license file each npm package ships. */
const bundled = {
  "@novnc/novnc": {
    dir: "novnc",
    files: [
      "LICENSE.txt",
      "AUTHORS",
      "docs/LICENSE.MPL-2.0",
      "docs/LICENSE.BSD-2-Clause",
      "docs/LICENSE.BSD-3-Clause",
      "docs/LICENSE.OFL-1.1",
      "vendor/pako/LICENSE",
    ],
  },
  "@xterm/xterm": { dir: "xterm", files: ["LICENSE"] },
};

describe.each(Object.entries(bundled))("%s", (name, { dir, files }) => {
  it("is pinned to an exact version", () => {
    expect(pkg.dependencies[name]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each(files)("has %s under third_party/ as the installed package ships it", (file) => {
    const shipped = readFileSync(join(root, "node_modules", name, file), "utf8");
    expect(readFileSync(join(root, "third_party", dir, file), "utf8")).toBe(shipped);
  });
});
