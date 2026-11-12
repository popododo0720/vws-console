import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = path.resolve(__dirname, "..");
/** A region name is data from GET /regions and the capability document; the source never names or branches on one. */
const regionLiteral = /(?<![A-Za-z0-9])(?:pve|ap)-/;
const fixture = (file: string) => /\.test\.tsx?$/.test(file) || file.split(path.sep).includes("testdata");

describe("region names in the source", () => {
  it("has no pve- or ap- literal under src outside tests and fixtures", () => {
    const files = readdirSync(srcDir, { recursive: true, encoding: "utf8" }).filter(
      (file) => /\.(tsx?|css)$/.test(file) && !fixture(file),
    );
    const hits = files.flatMap((file) =>
      readFileSync(path.join(srcDir, file), "utf8")
        .split("\n")
        .flatMap((line, index) => (regionLiteral.test(line) ? [`${file}:${index + 1}`] : [])),
    );
    expect(files.length).toBeGreaterThan(100);
    expect(hits).toEqual([]);
  });
});
