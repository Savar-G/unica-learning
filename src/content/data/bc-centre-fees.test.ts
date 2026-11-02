import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import data from "./bc-centre-fees-2026-11-01.json";

const stem = "public/resources/data/bc-centre-fees-2026-11-01";
const bc = data.centres.filter((row) => row.market === "BC");

describe("published centre-fee research", () => {
  it("keeps the dated sample separate from the outside-BC comparison", () => {
    expect(bc).toHaveLength(13);
    expect(data.centres.filter((row) => row.market === "online-outside-bc")).toHaveLength(1);
    expect(Math.min(...bc.map((row) => row.tuitionLow))).toBe(180);
    expect(Math.max(...bc.map((row) => row.tuitionHigh))).toBe(260);
    expect(data.centres.every((row) => row.checked === data.checked)).toBe(true);
  });

  it("supports each fee count without treating an unlisted fee as free", () => {
    expect(bc.filter((row) => row.enrollment === 80)).toHaveLength(13);
    expect(bc.filter((row) => row.materials === 30)).toHaveLength(11);
    expect(bc.filter((row) => row.materials === 20)).toHaveLength(1);
    expect(bc.filter((row) => row.materials === null)).toHaveLength(1);
    expect(data.centres.some((row) => row.materials === 0)).toBe(false);
  });

  it("provides a distinct primary source and a valid range for every row", () => {
    expect(new Set(data.centres.map((row) => row.source)).size).toBe(data.centres.length);
    for (const row of data.centres) {
      expect(row.source).toMatch(/^https:\/\/www\.kumon\.com\/[a-z-]+\/aboutcenter$/);
      expect(Number.isInteger(row.tuitionLow) && Number.isInteger(row.tuitionHigh)).toBe(true);
      expect(row.tuitionLow).toBeGreaterThan(0);
      expect(row.tuitionHigh).toBeGreaterThanOrEqual(row.tuitionLow);
    }
  });

  it("publishes matching JSON and CSV, with empty cells for missing fees", () => {
    expect(execFileSync(process.execPath, ["scripts/build-fee-data.mjs", "--check"], { encoding: "utf8" })).toContain("14 source rows");
    expect(JSON.parse(readFileSync(`${stem}.json`, "utf8"))).toEqual(data);
    const csv = readFileSync(`${stem}.csv`, "utf8").trimEnd().split("\n");
    expect(csv).toHaveLength(15);
    expect(csv.filter((line) => line.includes('"80",,"https://'))).toHaveLength(2);
  });

  it("publishes a full-size chart of only the BC sample", () => {
    const png = readFileSync(`${stem}.png`);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1920, 1440]);
    const svg = readFileSync(`${stem}.svg`, "utf8");
    for (const row of bc) expect(svg).toContain(row.centre);
    expect(svg).not.toContain(">Canada Virtual (online, based in Calgary)<");
    expect(svg).toContain("Convenience sample");
  });
});
