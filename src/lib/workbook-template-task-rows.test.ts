import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import { packageItem, type AnswerRegion } from "@/lib/question-package";
import { sampleBook } from "@/lib/workbook-sample-book";
import { CARD_LINES, pagePlan, textRoom, workbookTemplate } from "@/lib/workbook-template";
import { regionNames, type DraftPage } from "@/lib/workbook-render";
import type { SlotName } from "@/lib/workbook-page";

const draft = () => sampleBook({ level: "U22", workbookId: "55555555-5555-4555-8555-000000000022", childId: "22222222-2222-4222-8222-222222222222", child: "Mateo", number: 1 }).draft;
const fixture = (slot: SlotName, title: string, count = 3) => {
  const book = draft();
  const source = book.pages.find(p => p.content?.kind === "day" && p.questions.length)!;
  if (source.content?.kind !== "day") throw new Error("Expected day page");
  const questions = Array.from({ length: count }, (_, i) => {
    const regions: AnswerRegion[] = i === 0
      ? [{ id: "answer", kind: "box", label: "Answer", answer: { type: "number", value: 5 } }, { id: "working", kind: "work", label: "Show your work" }]
      : [{ id: "answer", kind: "choice", label: null, mark: "circle", choices: ["yes", "no"], answer: "yes" }];
    return { ...source.questions[0], number: i === 0 ? 1 : i + 9, package: { ...source.questions[0].package,
      text: i === 0 ? "There are two red counters and three blue counters. How many counters are there altogether?" : "If both arms of an angle become longer but stay in the same directions, does the angle stay the same size?",
      operation: null, templateId: null, item: { format: i === 0 ? "show-work" as const : "circle" as const, scorable: true, parentChecked: false, error: null, checks: [], regions },
    } };
  });
  const page: DraftPage = { ...source, questions, content: { ...source.content, consistentLayout: true, pages: 6, title,
    blocks: [{ slot, items: questions.map(q => q.number), note: "Read each question carefully." }] } };
  const root = new Window().document.createElement("div");
  root.innerHTML = workbookTemplate().page(page, { qr: "", qrUrl: "" }, book)!;
  return { root, page };
};

describe("readable task rows", () => {
  it("keeps three Challenge identities and response regions, with a full-width prompt before its answer and labeled work", () => {
    const { root, page } = fixture("challenge", "Mixed review");
    const cards = root.querySelectorAll(".challenge-rows>.task-card");
    expect(cards).toHaveLength(3);
    expect(root.querySelector(".side3, .side2")).toBeNull();
    expect(cards[0].querySelector(".task-response>.task-answer .ab")).toBeTruthy();
    expect(cards[0].querySelector(".task-work .wb .lab")?.textContent).toBe("Show your work");
    expect(cards[0].firstElementChild?.classList.contains("task-prompt")).toBe(true);
    expect(cards[0].lastElementChild?.classList.contains("task-response")).toBe(true);
    expect(cards[0].querySelector(".task-prompt .task-answer, .task-prompt .task-work")).toBeNull();
    for (const card of [...cards].slice(1)) {
      expect(card.classList.contains("nowork")).toBe(true);
      expect(card.querySelector(".task-work, .wb, .work-space")).toBeNull();
      expect(card.querySelector(".task-prompt .q .rgs .circ")).toBeTruthy();
    }
    for (const q of page.questions) {
      expect(root.querySelector(`[data-measure="question-${q.number}"]`)).toBeTruthy();
      for (const { name } of regionNames(q)) expect(root.querySelector(`[data-measure="${name}"]`)).toBeTruthy();
      expect(packageItem(q.package).regions.length).toBeGreaterThan(0);
    }
    expect(pagePlan(page)?.rows).toEqual([]);
  });

  it("budgets the same three prompt lines that strict Challenge checks enforce", () => {
    const room = textRoom("challenge", 10, 8, true)!;
    expect(room.lines).toBe(CARD_LINES);
    expect(room.perLine).toBeGreaterThan(textRoom("challenge", 10, 8, false)!.perLine);
  });

  it.each(["show-what-you-know", "level-test"] as const)("gives all five %s tasks the same full-width placement", slot => {
    const { root, page } = fixture(slot, "Show what you know", 5);
    expect(root.querySelectorAll(".task-rows>.tc")).toHaveLength(5);
    expect(root.querySelector(".fill, [style*='grid-column']")).toBeNull();
    for (const row of root.querySelectorAll(".tc")) expect(row.querySelector(".q>.rgs")).toBeTruthy();
    expect(root.querySelectorAll(".task-work")).toHaveLength(1);
    expect(pagePlan(page)).toMatchObject({ rows: [], incomplete: [] });
    expect(root.querySelectorAll(".number-digit")).toHaveLength(5);
    expect(root.textContent).toContain("stay in the same directions");
  });

  it.each([
    ["math-in-the-world", "Math in the world", "Word problems"],
    ["word-problems", "Word problems", "Word problems"],
    ["show-what-you-know", "Show what you know", "Show what you know"],
    ["challenge", "Challenge", "Challenge"],
  ] as const)("prints %s's title once while keeping the distinct note", (slot, title, printed) => {
    const { root } = fixture(slot, title);
    expect(root.querySelector("h1")?.textContent).toBe(printed);
    expect([...root.querySelectorAll(".chip")].some(chip => chip.textContent?.trim() === printed)).toBe(false);
    expect(root.textContent).toContain("Read each question carefully.");
  });
});
