import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import type { readScanMarking } from "@/lib/scan-marking-server";
import { readScanResultsPage } from "./scan-page-results-server";
import { firstObservation, type ExpectedItem } from "@/lib/scan-observation";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/scan-photo-server", () => ({ scanView: async () => ({ id: "photo", child_id: "child", workbook_id: "book", page_id: "page", child: "Leah", day: "Day 9", page: 67, state: "saved", width: 1200, height: 1600 }) }));
const size = { width: 1000, height: 2000 };
const contract = { version: 1, workbookId: "book", page: 67, day: 9, pageOfDay: 1, label: "67",
  coordinates: { units: "image-px", origin: "top-left", x: "right", y: "down", orientation: "portrait", image: size, cssPage: size, scale: { x: 1, y: 1 } },
  marks: { anchor: "outer-corner", order: ["tl", "tr", "br", "bl"], points: { tl: { x: 10, y: 10 }, tr: { x: 990, y: 10 }, br: { x: 990, y: 1990 }, bl: { x: 10, y: 1990 } } },
  fingerprints: { content: "content", image: "a".repeat(64) } };
const item = { itemId: "seven", number: 7, version: 2, state: "scored" as const, result: "wrong" as const, readAnswerText: "8", canChange: true, actor: "system" as const, at: "saved", evidencePhoto: "photo", photoAvailable: true, label: "Wrong", explainable: true, questionText: "17 − 8", correctAnswer: "9" };
const result: NonNullable<Awaited<ReturnType<typeof readScanMarking>>> = { items: [item], marks: [], detail: null, photoAvailable: true, budgetHeld: false, unfinished: false,
  completion: { status: "complete", total: 1, finished: 1, items: [] }, counts: { scored: 1, unscored: 0, teamChecks: 0, pending: 0 }, solutionsAvailable: true };

function database(change: string) {
  const requests: URL[] = [];
  const db = createClient<Database>("https://synthetic.supabase.co", "synthetic", { global: { fetch: async url => {
    const address = new URL(String(url)); requests.push(address);
    if (address.pathname.endsWith("scan_photos") && address.searchParams.get("id")?.startsWith("in.")) return Response.json([{ id: "other-photo", width: 900, height: 1600, state: "saved", expires_at: new Date(Date.now() + 60_000).toISOString(), printed_revision: "print" }]);
    if (change === "read-error" && address.pathname.endsWith("workbook_pages")) return Response.json({ message: "unavailable" }, { status: 500 });
    const rows: Record<string, unknown> = {
      scan_photos: { printed_revision: "print" },
      workbook_pages: { page_number: 67, image_width: 1000, image_height: 2000, print_contract: change === "missing-contract" ? null : change === "invalid-contract" ? { ...contract, workbookId: "another-book" } : contract },
      workbooks: { status: "shipped", printed_revision: change === "other-print" ? "other" : "print" },
      workbook_questions: [{ question_number: 7, regions: change === "missing-regions" ? null : [{ id: "answer", kind: "box", box: { x: 700, y: 800, width: 100, height: 100 } }], box_x: 100, box_y: 700, box_width: 750, box_height: 300 }],
      scan_calibrations: change === "no-calibration" ? null : { state: "ready", printed_revision: change === "old-calibration" ? "older" : "print", result: {
        sheetCheck: change === "unchecked" ? 0 : 1, parts: ["straight"], straight: change === "wrong-size" ? { width: 10, height: 20 } : size,
      } },
    };
    return Response.json(rows[address.pathname.split("/").at(-1)!]);
  } } });
  return { db, requests };
}
it("reads only family-scoped frozen coordinates and an already stored, checked straightened photo", async () => {
  const { db, requests } = database("ready");
  const data = await readScanResultsPage(db, "parent", "photo", result);
  expect(data).toMatchObject({ child: "Leah", day: "Day 9", page: 67, photo: { src: "/api/account/scans/photo/preview/straight", ...size, aligned: true } });
  expect(data?.questions[0]).toMatchObject({ kind: "review", correctAnswer: "9", explainable: true, regions: [{ x: .7, y: .4, width: .1, height: .05 }], questionBox: { x: .1, y: .35, width: .75, height: .15 } });
  expect(requests).toHaveLength(5);
  for (const request of requests) { expect(request.searchParams.get("parent_id")).toBe("eq.parent"); expect(request.pathname).not.toMatch(/rpc|storage|render/); }
});
it.each(["missing-contract", "invalid-contract", "other-print", "no-calibration", "old-calibration", "unchecked", "wrong-size", "read-error"])("%s cannot overlay coordinates on an unaligned photo", async change => {
  const { db } = database(change);
  const data = await readScanResultsPage(db, "parent", "photo", result);
  expect(data?.photo).toMatchObject({ aligned: false, src: "/api/account/scans/photo/image" });
  expect(data?.questions[0].regions).toEqual([]); expect(data?.questions[0].questionBox).toBeNull();
  if (["missing-contract", "invalid-contract", "other-print", "read-error"].includes(change)) {
    expect(data?.questions[0]).toMatchObject({ correctAnswer: null, explainable: false });
  }
});
it("does not reuse one photo's coordinates for another photo's evidence", async () => {
  const { db } = database("ready");
  const data = await readScanResultsPage(db, "parent", "photo", { ...result, items: [{ ...item, evidencePhoto: "other-photo" }] });
  expect(data?.questions[0]).toMatchObject({ regions: [], questionBox: null, evidencePhoto: "other-photo", evidenceImage: { src: "/api/account/scans/other-photo/image", width: 900, height: 1600, aligned: false } });
});
it("missing regions are not replaced by question boxes as answer markers", async () => {
  const { db } = database("missing-regions");
  const data = await readScanResultsPage(db, "parent", "photo", result);
  expect(data?.questions[0].regions).toEqual([]); expect(data?.questions[0].questionBox).not.toBeNull();
});
it("an expired photo stays unavailable, including its evidence, without losing the stored review", async () => {
  const { db } = database("ready");
  const data = await readScanResultsPage(db, "parent", "photo", { ...result, photoAvailable: false, items: [{ ...item, photoAvailable: false }] });
  expect(data?.photo).toBeNull(); expect(data?.questions[0]).toMatchObject({ evidencePhoto: null, correctAnswer: "9" });
});
it("the canonical team wait overrides review wording and withholds the reading and key", async () => {
  const { db } = database("ready");
  const expected: ExpectedItem = { identity: { workbookId: "book", printedRevision: "print", pageId: "page", itemId: "seven" }, number: 7,
    method: "code", scoredRegions: ["answer"], teaching: null, mastery: { eligible: false, reason: "no-teaching-context" } };
  const observation = { ...firstObservation(expected, "photo"), certainty: "uncertain" as const };
  const data = await readScanResultsPage(db, "parent", "photo", { ...result, items: [{ ...item, state: "pending", result: null }],
    marks: [{ expected, observation, originalEvent: null, eventId: null, at: "saved", model: "synthetic", prompt: null }] });
  expect(data?.questions[0]).toMatchObject({ kind: "team", readAnswer: null, questionText: null, correctAnswer: null, explainable: false });
});
