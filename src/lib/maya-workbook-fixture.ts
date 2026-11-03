// Synthetic records for public-interface tests and local screenshots. No hosted rows or providers.
import { memoryWorkbookStore } from "@/lib/workbook-store-memory";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { mayaCalls, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import type { WorkbookSelectionReader } from "@/lib/maya-workbook-question";

export const WORKBOOK_FIXTURE_IDS = {
  parent: "11111111-1111-4111-8111-111111111111", child: "22222222-2222-4222-8222-222222222222",
  workbook: "33333333-3333-4333-8333-333333333333", sibling: "44444444-4444-4444-8444-444444444444",
};

export async function mayaWorkbookFixture() {
  const ids = WORKBOOK_FIXTURE_IDS;
  let now = Date.UTC(2026, 10, 2, 16);
  let id = 0;
  const children = [{ id: ids.child, parentId: ids.parent }, { id: ids.sibling, parentId: ids.parent }];
  const books = memoryWorkbookStore({ children, now: () => new Date(now) });
  const path = `${ids.parent}/${ids.workbook}/page-4.png`;
  const result = await books.write({ id: ids.workbook, childId: ids.child, number: 1, levels: [9], pdfPath: null, profileBuild: null,
    pages: [{ number: 4, type: "practice", dayLabel: "Monday", qrToken: "synthetic-page-four-token", image: { path, width: 600, height: 780 },
      questions: [1, 3].map((number, i) => ({ number, box: { x: 45, y: 170 + i * 260, width: 510, height: 220 },
        package: { ...SAMPLE_PACKAGES["add-27-39"], id: `${ids.workbook}:4:${number}`, ref: { source: "workbook", workbookId: ids.workbook, page: 4, question: number } },
      })) }],
  });
  if (result.status !== "written") throw Error(result.reason);
  books.setStatus(ids.workbook, "printed");
  const book = (await books.workbook(ids.workbook))!;
  const store = memoryCallStore({ testFamilies: [ids.parent] });
  const connections = memoryConnectionLog(store, () => now);
  const seams: CallSeams = {
    store, connections, history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children })),
    rebuild: async () => true, model: () => ruleMayaModel(), isTestFamily: async p => p === ids.parent,
    alerts: { send: async () => {}, list: async () => [] }, clock: () => now, seed: () => 42,
    newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
  };
  const reader: WorkbookSelectionReader = {
    books, child: async child => children.some(c => c.id === child) ? { parentId: ids.parent, firstName: "Iris", grade: 2 } : null,
    isTestFamily: seams.isTestFamily,
  };
  return { ids, book, books, reader, store, seams, calls: mayaCalls(seams), advance: () => { now += 5000; } };
}
