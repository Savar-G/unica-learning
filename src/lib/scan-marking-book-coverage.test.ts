import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fixtures from "./scan-marking-comparison.test-fixtures.json";
import type { QuestionPackage } from "@/lib/question-package";
import type { WorkbookInput } from "@/lib/workbook-content";
import type { PagePrintContract } from "@/lib/workbook-print-contract";

// A malformed local contract must not obtain complete coverage merely because supplied readings match its key.
const folder = mkdtempSync(join(tmpdir(), "unica-book-coverage-"));
const bundle = join(folder, "coverage.mjs");
beforeAll(async () => {
  await build({ entryPoints: ["scripts/scan-marking-book-coverage-cli.ts"], outfile: bundle, bundle: true,
    platform: "node", target: "node22", format: "esm", packages: "external" });
});
afterAll(() => rmSync(folder, { recursive: true, force: true }));

function book(): WorkbookInput {
  const id = "00000000-0000-4000-8000-000000000542", width = 1000, height = 1400;
  const pkg = structuredClone(fixtures.packages.whole) as unknown as QuestionPackage;
  pkg.ref = { source: "workbook", workbookId: id, page: 1, question: 1 };
  const printContract: PagePrintContract = { version: 1, workbookId: id, page: 1, label: null, day: null, pageOfDay: null,
    coordinates: { units: "image-px", origin: "top-left", x: "right", y: "down", orientation: "portrait",
      image: { width, height }, cssPage: { width, height }, scale: { x: 1, y: 1 } },
    marks: { anchor: "outer-corner", order: ["tl", "tr", "br", "bl"],
      points: { tl: { x: 1, y: 1 }, tr: { x: 999, y: 1 }, br: { x: 999, y: 1399 }, bl: { x: 1, y: 1399 } } },
    fingerprints: { content: "made-up-coverage-control", image: "0".repeat(64) } };
  return { id, childId: "00000000-0000-4000-8000-000000000543", number: 1, levels: [16], pdfPath: null,
    profileBuild: null, printedRevision: "a".repeat(28), pages: [{ number: 1, dayLabel: null, type: "practice",
      image: { path: "unused.png", width, height }, qrToken: "made-up-test-token", printContract,
      questions: [{ number: 1, package: pkg, box: { x: 10, y: 10, width: 300, height: 100 }, teaching: null,
        regions: pkg.item!.regions.map(r => ({ id: r.id, kind: r.kind, box: { x: 10, y: 10, width: 200, height: 100 } })) }] }] };
}
function run(input: unknown, wrongHash = false) {
  const path = join(folder, "input.json");
  writeFileSync(path, JSON.stringify(input));
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
  const result = spawnSync(process.execPath, [bundle, path, wrongHash ? "f".repeat(64) : hash], { encoding: "utf8" });
  return { status: result.status, output: result.stdout ? JSON.parse(result.stdout) : null };
}
describe("frozen-book coverage CLI", () => {
  it("checks a valid stored question through right, nullable blank and unclear readings", () => {
    expect(run(book())).toMatchObject({ status: 0, output: { complete: true, questions: 1, code: 1,
      unsupported: 0, suppliedRight: 1, suppliedNullBlank: 1, suppliedUnclear: 1 } });
  });
  it.each(["workbook", "page", "question", "assessment"])("refuses a package with a different %s reference", kind => {
    const b = book(), q = b.pages[0].questions[0];
    q.package.ref = kind === "assessment" ? { source: "assessment", assessmentId: b.id, questionId: "other" }
      : { source: "workbook", workbookId: kind === "workbook" ? b.childId : b.id,
        page: kind === "page" ? 2 : 1, question: kind === "question" ? 2 : 1 };
    expect(run(b)).toEqual({ status: 1, output: null });
  });
  it.each(["outside", "negative", "duplicate", "missing"])("reports a gap for %s measured regions", kind => {
    const b = book(), q = b.pages[0].questions[0];
    if (kind === "missing") q.regions = [];
    else if (kind === "duplicate") q.regions!.push(structuredClone(q.regions![0]));
    else q.regions![0].box!.x = kind === "outside" ? 1001 : -1;
    expect(run(b)).toMatchObject({ status: 1, output: { complete: false, unsupported: 1, code: 0 } });
  });
  it.each(["id", "childId"] as const)("refuses a missing %s", key => {
    const b = book(); Reflect.deleteProperty(b, key);
    expect(run(b)).toEqual({ status: 1, output: null });
  });
  it("refuses a changed source hash", () => expect(run(book(), true)).toEqual({ status: 1, output: null }));
});
