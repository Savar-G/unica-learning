import type { ScheduleMemory } from "@/lib/parent-schedule-memory";
import { buildPrintContract, printedRevision, type ScanManifest } from "@/lib/workbook-print-contract";
import { sampleDraft } from "@/lib/workbook-sample";
import type { GeneratedPage, GeneratedWorkbook } from "@/lib/workbook-generator";
import type { PageContent } from "@/lib/workbook-page";

// Hand-written synthetic records. No generation, rendering engine, provider or database is used.
export function scheduleFixture(child = "c1", parent = "p1", book = "b1", twoPageDay = false): ScheduleMemory {
  const question = sampleDraft({ workbookId: book, childId: child, qrTokens: ["a", "b", "c"] }).pages[1].questions[0].package;
  const page = (number: number, content: PageContent): GeneratedPage => ({ number, type: content.kind === "day" ? "practice" : "how-plan", dayLabel: content.kind === "day" && !content.extraPractice ? `Day ${content.day}` : null,
    day: content.kind === "day" ? content.day : null, pageOfDay: content.kind === "day" ? content.page : null,
    qrToken: `qr-${number}`, fit: { status: "fits" }, attempts: 0, content,
    questions: content.kind === "day" ? [{ number: 1, slot: "1.1", part: "practice", check: { status: "checked" }, attempts: 1, package: structuredClone(question) }] : [],
  });
  const draft: GeneratedWorkbook = { id: book, childId: child, number: 1, levels: [10], profileBuild: null, model: "synthetic", counts: { pages: 4, questions: 3, checked: 3, notChecked: 0, failed: 0, failedPages: 0 }, pages: [
    page(2, { kind: "how-plan", id: "plan", level: 10, child, workbook: 1, pagesADay: 1, minutes: { min: 15, max: 20 }, rows: [
      { day: 2, topic: "Second printed row first", second: "Subtraction", pages: [4, 4], requiredMinutes: 20 + 1e-10 },
      { day: 1, topic: "Addition", second: "Number facts", pages: [3, twoPageDay ? 5 : 3], requiredMinutes: 17.2 },
    ] }),
    ...[1, 2, 3].map(day => page(day + 2, { kind: "day", id: `day${day}`, level: 10, day: day === 3 ? 1 : day, page: 1, pages: 1,
      topic: "Practice", title: "Practice", subtitle: "Practice", grownUp: null, extraPractice: day === 3 && !twoPageDay,
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
  const manifest: ScanManifest = { version: 1, curriculum: { key: "BC", version: "frozen" }, testWorkbook: false, snapshotDay: 7, levelTest: null, days: [{ day: 1, pages: twoPageDay ? [3, 5] : [3] }, { day: 2, pages: [4] }] };
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
    pages, receipts: [],
  };
}
