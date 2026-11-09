import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { replayWorkbookPreviewAny, type WorkbookPreviewRecord, type WorkbookPreviewDocumentV2 } from "./workbook-preview-record";
import { evaluateBook1Preview } from "./workbook-book1-preview";
import type { WorkbookPreviewRequest } from "./workbook-progress-source";

// Captured synthetic records from the version 1 and 2 engines, before the version 3 work.
function fixture(name: string): { actor: string; request: WorkbookPreviewRequest; record: WorkbookPreviewRecord } {
  return JSON.parse(gunzipSync(readFileSync(new URL(`./test-fixtures/${name}`, import.meta.url))).toString("utf8"));
}
describe("fixed saved preview records", () => {
  it("replays a fixed version 1 record", async () => {
    const f = fixture("workbook-preview-v1.json.gz");
    expect(f.record.hash).toBe("aab431565829fbe6f1d0423c2d47b78ed2e1e225df8ec053475169158440fd4e");
    expect(await replayWorkbookPreviewAny(f.record, f.actor, f.request)).toMatchObject({ version: 1, outcome: { availability: "unavailable", plan: null } });
  });
  it("refuses a fixed version 2 record when its curriculum has changed", async () => {
    const f = fixture("workbook-preview-v2.json.gz");
    expect(f.record.hash).toBe("861fad14f822f7dcb490e972ea9ab254392b3cc4cb1ec4f7995e0ff653867819");
    const saved = JSON.parse(f.record.payload) as WorkbookPreviewDocumentV2;
    expect(await evaluateBook1Preview(f.request, saved.frozen)).toMatchObject({ ok: false, availability: "unavailable", reasons: ["curriculum-version-changed"] });
    expect(await replayWorkbookPreviewAny(f.record, f.actor, f.request)).toBeNull();
  });
  it("replays a fixed version 2 result made with the current curriculum", async () => {
    const f = fixture("workbook-preview-v2-current.json.gz");
    expect(f.record.hash).toBe("f1da2444365d862d0cb0c0bdf7896f89d5e1927a6e60686efc0f81fa2e2847d3");
    const result = await replayWorkbookPreviewAny(f.record, f.actor, f.request);
    expect(result).toMatchObject({ version: 2, outcome: { availability: "complete", decision: { action: "advance" } } });
    expect(result?.outcome.consumedVersions).toHaveLength(52);
  });
});
