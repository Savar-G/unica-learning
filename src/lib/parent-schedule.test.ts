import { expect, it } from "vitest";
import { Window } from "happy-dom";
import { readSchedule, type ScheduleScan } from "@/lib/parent-schedule";
import { memoryScheduleStore, type ScheduleMemory } from "@/lib/parent-schedule-memory";
import { savedScheduleV1 } from "@/lib/parent-schedule-v1";
import { buildPrintContract, printedRevision, type ScanManifest } from "@/lib/workbook-print-contract";
import { sampleDraft } from "@/lib/workbook-sample";
import { workbookTemplate } from "@/lib/workbook-template";
import type { GeneratedPage, GeneratedWorkbook } from "@/lib/workbook-generator";
import type { PageContent } from "@/lib/workbook-page";

// Hand-written synthetic records. No generation, rendering engine, provider or database is used.
function fixture(child = "c1", parent = "p1", book = "b1"): ScheduleMemory {
  const question = sampleDraft({ workbookId: book, childId: child, qrTokens: ["a", "b", "c"] }).pages[1].questions[0].package;
  const page = (number: number, content: PageContent): GeneratedPage => ({ number, type: content.kind === "day" ? "practice" : "how-plan", dayLabel: content.kind === "day" && !content.extraPractice ? `Day ${content.day}` : null,
    day: content.kind === "day" ? content.day : null, pageOfDay: content.kind === "day" ? content.page : null,
    qrToken: `qr-${number}`, fit: { status: "fits" }, attempts: 0, content,
    questions: content.kind === "day" ? [{ number: 1, slot: "1.1", part: "practice", check: { status: "checked" }, attempts: 1, package: structuredClone(question) }] : [],
  });
  const draft: GeneratedWorkbook = { id: book, childId: child, number: 1, levels: [10], profileBuild: null, model: "synthetic", counts: { pages: 4, questions: 3, checked: 3, notChecked: 0, failed: 0, failedPages: 0 }, pages: [
    page(2, { kind: "how-plan", id: "plan", level: 10, child, workbook: 1, pagesADay: 1, minutes: { min: 15, max: 20 }, rows: [
      { day: 2, topic: "Second printed row first", second: "Subtraction", pages: [4, 4], requiredMinutes: 20 + 1e-10 },
      { day: 1, topic: "Addition", second: "Number facts", pages: [3, 3], requiredMinutes: 17.2 },
    ] }),
    ...[1, 2, 3].map(day => page(day + 2, { kind: "day", id: `day${day}`, level: 10, day: day === 3 ? 1 : day, page: 1, pages: 1,
      topic: "Practice", title: "Practice", subtitle: "Practice", grownUp: null, extraPractice: day === 3,
      blocks: [{ slot: "now-you", items: [1] }],
    })),
  ] };
  const rendering = { pdfPath: `${parent}/${book}/private.pdf`, pdfSha256: "a".repeat(64), pages: draft.pages.map(p => {
    const marks = ["tl", "tr", "br", "bl"].map((name, i) => ({ name: `scan-${name}`, x: [20, 780, 780, 20][i], y: [20, 20, 1020, 1020][i], width: 16, height: 16, visible: true }));
    const contract = buildPrintContract({ workbookId: book, page: { ...p, questions: p.questions.flatMap(q => q.package ? [{ number: q.number, package: q.package }] : []) },
      marks, css: { width: 816, height: 1056 }, image: { width: 816, height: 1056, sha256: "b".repeat(64) } });
    if (!contract.contract) throw new Error(contract.problem);
    return { number: p.number, image: { path: "private.png", width: 816, height: 1056 }, questions: [], printContract: contract.contract };
  }) };
  const manifest: ScanManifest = { version: 1, curriculum: { key: "BC", version: "frozen" }, testWorkbook: false, snapshotDay: 7, levelTest: null, days: [{ day: 1, pages: [3] }, { day: 2, pages: [4] }] };
  const pages = rendering.pages.map(p => ({ book, parent, child, page: { id: `page-${book}-${p.number}`, number: p.number, contract: p.printContract,
    qrToken: draft.pages.find(d => d.number === p.number)!.qrToken,
    questions: draft.pages.find(d => d.number === p.number)!.questions.map(q => ({ number: q.number, package: { id: q.package!.id }, box: { x: 100, y: 100, width: 80, height: 80 }, regions: null, teaching: null })),
  } }));
  const identity = printedRevision({ id: book, ...rendering, printManifest: manifest, pages: pages.map(p => ({ ...p.page, printContract: p.page.contract })) })!;
  return {
    children: [{ id: child, parentId: parent, firstName: child === "c1" ? "Leah" : "Kai" }],
    books: [{ id: book, parentId: parent, childId: child, number: 1, status: "printed", printedRevision: identity, pdfPath: rendering.pdfPath, pdfSha256: rendering.pdfSha256, manifest }],
    approvals: [{ parentId: parent, childId: child, draftId: book, workbookId: book, revision: 1, number: 1, printedRevision: identity }],
    revisions: [{ book, revision: 1, source: { parentId: parent, childId: child, number: 1, draft, rendering } }],
    pages, scans: [],
  };
}
const read = (data: ScheduleMemory, request = {}) => readSchedule(memoryScheduleStore(data), "p1", request);
const draftOf = (data: ScheduleMemory) => data.revisions[0].source.draft;

it("binds to the approved revision, preserves printed row order and exposes only safe fields", async () => {
  const data = fixture();
  const newer = structuredClone(data.revisions[0]);
  newer.revision = 2;
  const plan = newer.source.draft.pages[0].content;
  if (plan?.kind === "how-plan") plan.rows[0].topic = "UNAPPROVED";
  data.revisions.push(newer);
  const view = await read(data);
  expect(view.kind).toBe("ready");
  if (view.kind !== "ready") return;
  expect(view.rows.map(r => [r.day, r.topic, r.second, r.pages, r.requiredMinutes])).toEqual([
    [2, "Second printed row first", "Subtraction", [4, 4], 20], [1, "Addition", "Number facts", [3, 3], 18],
  ]);
  expect(JSON.stringify(view)).not.toMatch(/UNAPPROVED|private\.pdf|private\.png|package|operation|pdfSha256|rendering/);
});

it("scopes both children and books and resolves the plain email deterministically", async () => {
  const data = fixture();
  const other = fixture("c2", "p1", "b2"), foreign = fixture("c3", "p2", "b3");
  for (const key of ["children", "books", "approvals", "revisions", "pages", "scans"] as const) (data[key] as unknown[]).push(...other[key], ...foreign[key]);
  expect(await read(data)).toMatchObject({ kind: "ready", child: { id: "c1" }, book: { id: "b1" } });
  expect(await read(data, { remembered: "c2" })).toMatchObject({ kind: "ready", child: { id: "c2" }, book: { id: "b2" } });
  expect(await read(data, { remembered: "c3" })).toMatchObject({ kind: "ready", child: { id: "c1" } });
  for (const request of [{ child: "c3" }, { child: "" }, { child: "c1", book: "" }, { child: "c1", book: "b2" }, { child: "c1", book: "b3" }]) expect(await read(data, request)).toEqual({ kind: "not-found" });
});

it.each(["draft", "approved"])("waits for print rather than promoting a %s", async status => {
  const data = fixture(); data.books[0].status = status;
  expect(await read(data)).toMatchObject({ kind: "waiting" });
  data.children = []; expect(await read(data)).toEqual({ kind: "waiting", child: null });
});

it.each(["audit", "revision", "pdf", "content", "contract", "manifest", "manifest-identity", "geometry", "token", "identity", "missing"])("refuses a stale or missing %s binding", async fault => {
  const data = fixture();
  if (fault === "audit") data.approvals[0].printedRevision = "other";
  if (fault === "revision") data.approvals[0].revision = 2;
  if (fault === "pdf") data.books[0].pdfSha256 = "f".repeat(64);
  if (fault === "content") draftOf(data).pages[0].content = { kind: "blank", id: "changed", level: 10 };
  if (fault === "contract") data.pages[0].page.contract = { ...data.pages[0].page.contract!, workbookId: "other" };
  if (fault === "manifest") data.books[0].manifest!.days[0].pages = [5];
  if (fault === "manifest-identity") data.books[0].manifest!.curriculum.version = "other-print";
  if (fault === "geometry") data.pages[1].page.questions = data.pages[1].page.questions.map(q => ({ ...q, box: { x: 99 } }));
  if (fault === "token") data.pages[0].page.qrToken = "other-print";
  if (fault === "identity") data.revisions[0].source.draft.childId = "other";
  if (fault === "missing") data.books[0].printedRevision = null;
  expect(await read(data)).toMatchObject({ kind: "unavailable" });
});

it("accepts equivalent JSONB key order but refuses ambiguous approved revisions", async () => {
  const data = fixture();
  for (const row of data.pages) row.page.contract = Object.fromEntries(Object.entries(row.page.contract!).reverse()) as typeof row.page.contract;
  expect(await read(data)).toMatchObject({ kind: "ready" });
  data.approvals.push({ ...data.approvals[0], revision: 2 });
  expect(await read(data)).toMatchObject({ kind: "unavailable" });
});

it("counts accepted required pages once, preserves expiry and ignores optional or unversioned records", async () => {
  const data = fixture();
  const revision = data.books[0].printedRevision!;
  const scan: ScheduleScan = { parentId: "p1", childId: "c1", workbookId: "b1", pageId: "page-b1-3", revision, state: "saved", sentAt: "2026-11-01", calibration: { state: "ready", revision, sheetCheck: 1 } };
  data.scans = [scan, { ...scan, state: "expired" }, { ...scan, pageId: "page-b1-5" }];
  expect(await read(data)).toMatchObject({ rows: [{ scan: { accepted: 0, required: 1 } }, { scan: { accepted: 1, required: 1 } }] });
  for (const refused of [{ ...scan, state: "pending" }, { ...scan, revision: "old" }, { ...scan, sentAt: null }, { ...scan, calibration: null },
    { ...scan, calibration: { ...scan.calibration!, state: "running" } }, { ...scan, calibration: { ...scan.calibration!, state: "refused" } },
    { ...scan, calibration: { ...scan.calibration!, sheetCheck: "1" } }, { ...scan, calibration: { ...scan.calibration!, revision: "old" } }]) {
    data.scans = [refused];
    expect(await read(data)).toMatchObject({ rows: [{ scan: { accepted: 0 } }, { scan: { accepted: 0 } }] });
  }
  data.fail = "scans";
  expect(await read(data)).toMatchObject({ kind: "ready", rows: [{ scan: { kind: "unknown" } }, { scan: { kind: "unknown" } }] });
  data.fail = "pages"; expect(await read(data)).toMatchObject({ kind: "unavailable" });
});

it.each(["override", "extra", "calculated", "global"])("matches actual page-2 HTML for %s required-time rules without a print engine", mode => {
  const draft = draftOf(fixture());
  const plan = draft.pages[0].content;
  if (plan?.kind !== "how-plan") throw new Error("Fixture plan missing");
  if (mode === "global") plan.rows.forEach(r => { delete r.requiredMinutes; });
  const day = draft.pages[1].content;
  if (day?.kind !== "day") throw new Error("Fixture day missing");
  if (mode === "calculated") day.requiredTimeTarget = 12;
  if (mode === "extra") { day.blocks[0].extra = true; day.blocks.push({ slot: "worked-example", items: [] }); }
  const printInput = { ...draft, pages: draft.pages.map(p => ({ ...p, questions: p.questions.flatMap(q => q.package ? [{ ...q, package: q.package }] : []) })) };
  const html = workbookTemplate().page(printInput.pages[0], { qr: "", qrUrl: "" }, printInput)!;
  const root = new Window().document.createElement("div"); root.innerHTML = html;
  const projection = savedScheduleV1(draft)!;
  expect(projection.rows.map(r => [r.day, r.topic, r.second, `${r.pages[0]}–${r.pages[1]}`, r.requiredMinutes === null ? null : `${r.requiredMinutes} min`])).toEqual(
    [...root.querySelectorAll("tbody tr")].map(row => {
      const cells = row.querySelectorAll("td");
      return [Number(cells[0].textContent!.replace("Day ", "")), cells[1].querySelector("b")!.textContent, cells[1].querySelector(".t2")!.textContent,
        cells[2].firstChild!.textContent, cells[2].querySelector(".plan-time")?.textContent ?? null];
    }));
  expect(root.textContent).toContain(projection.dailyTime);
});
