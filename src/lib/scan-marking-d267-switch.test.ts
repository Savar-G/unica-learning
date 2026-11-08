// D-267's team items are a temporary state while a format's AI marking is off. The switch is read from the marking
// module itself (TWO_WAYS_METHOD_MARKS in @/lib/scan-marking): this test mocks that one export, never a copy.
import { afterEach, describe, expect, it, vi } from "vitest";
import fixtures from "./scan-marking-comparison.test-fixtures.json";
import publicEvidence from "../../data/scan-marking-endpoint-evidence-20261106.json";
import type { ComparisonFormat, ComparisonPhoto, ComparisonResult, EndpointSnapshot } from "@/lib/scan-marking-comparison";
import type { QuestionPackage } from "@/lib/question-package";

async function withSwitch(on: boolean) {
  vi.resetModules();
  vi.doMock("@/lib/scan-marking", async original => ({ ...await original<typeof import("@/lib/scan-marking")>(), TWO_WAYS_METHOD_MARKS: on }));
  const comparison = await import("@/lib/scan-marking-comparison"), marking = await import("@/lib/scan-marking"), observation = await import("@/lib/scan-observation");
  expect(marking.TWO_WAYS_METHOD_MARKS).toBe(on);
  return { ...comparison, ...marking, ...observation };
}
afterEach(() => { vi.doUnmock("@/lib/scan-marking"); vi.resetModules(); });

/** One clear photo with a whole-number item and a two-ways item; the model reads the first and is unsure of the second. */
async function score(on: boolean) {
  const m = await withSwitch(on), model = m.COMPARISON_MODELS[0];
  const formats: ComparisonFormat[] = ["whole", "two-ways"];
  const questions = formats.map((format, i) => {
    const pkg = structuredClone(fixtures.packages[format as keyof typeof fixtures.packages]) as unknown as QuestionPackage;
    pkg.id = `synthetic-item-${i}`; pkg.ref = { source: "workbook", workbookId: m.SYNTHETIC_IDS.workbook, page: 3, question: i + 1 };
    return { number: i + 1, package: pkg, teaching: null, regions: pkg.item!.regions.map((r, k) => ({ id: r.id, kind: r.kind, box: { x: 10 + k * 210, y: 10 + i * 110, width: 200, height: 100 } })) };
  });
  const id = "synthetic-photo-0";
  const photo = { id, clear: true, image: { path: `${id}.jpg`, sha256: m.hashBytes(id), width: 1000, height: 1400, metadataFree: true },
    frame: { parentId: m.SYNTHETIC_IDS.parent, childId: m.SYNTHETIC_IDS.child, workbookId: m.SYNTHETIC_IDS.workbook, pageId: "synthetic-page-3", pageNumber: 3, printedRevision: "a".repeat(28), photo: id, ready: true, questions },
    truth: questions.map((q, i) => ({ itemId: q.package.id, format: formats[i], result: "right", readings: [] })) } as unknown as ComparisonPhoto;
  const observations = m.expectedItems(photo.frame).map((e, i) => ({ ...m.firstObservation(e, id), ...(i === 0 ? { state: "scored", result: "right", issue: null } : { result: null, issue: "blurry" }) }));
  const evidence = m.preflightEndpoint(model, structuredClone(publicEvidence.snapshots[model.model as keyof typeof publicEvidence.snapshots]) as EndpointSnapshot, structuredClone(publicEvidence.zdr));
  const result = { run: m.hashBytes("run"), model: model.model, photo: id, status: "complete", failure: null, schemaValid: true,
    attempts: [{ id: m.hashBytes(id), latencyMs: 100, error: null, usage: { generationId: "gen", provider: model.providerName, model: model.model, costMicros: 1000, inputTokens: 4000, outputTokens: 100, reasoningTokens: 0, imageTokens: 2000 } }],
    observations, requestHash: m.hashValue(m.markingRequest(photo.frame, new Uint8Array())), photoHash: photo.image.sha256, evidenceHash: m.hashValue(evidence) } as unknown as ComparisonResult;
  const manifest = { version: 1, synthetic: true, identity: { name: "Robin", madeUp: true, containsRealData: false, profileSource: "sampleChild/samplePlanInput" },
    source: { synthetic: true, draftSha256: m.hashBytes("d"), renderSha256: m.hashBytes("r"), fixtureSha256: m.hashBytes("f") }, photos: [photo] } as const;
  return { report: m.scoreComparison(manifest, model, [result], evidence), line: m.teamLine(m.teamItemsOf([photo])) };
}

describe("D-267 two-ways items follow the marking's own switch", () => {
  it("switch off: the two-ways item is the team's and is left out of the count and the total", async () => {
    const { report, line } = await score(false);
    expect(report).toMatchObject({ teamItems: 1, clearUnsure: 0, clearDenominator: 1, clearUnsureWithTeam: 1, clearDenominatorWithTeam: 2, passed: true });
    expect(line).toBe("1 item went to the team: two-ways method marking is off.");
  });
  it("switch on: the two-ways item is the AI's again, in the count and the total, and its unsure fails the bar", async () => {
    const { report, line } = await score(true);
    expect(report).toMatchObject({ teamItems: 0, clearUnsure: 1, clearDenominator: 2, clearUnsureWithTeam: 1, clearDenominatorWithTeam: 2, passed: false });
    expect(line).toBe("0 items went to the team.");
  });
});
