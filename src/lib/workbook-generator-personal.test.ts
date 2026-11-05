// G1 (docs/workbook-personalization.md section 7): each persona's fake book against a fixed set of visible features.
// Fake AI, the key solver and a fit check that holds ten questions a page: no browser, no network.
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakeWorkbookItems } from "@/lib/workbook-ai-fake";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { generateWorkbook, reviseWorkbookPage, type GeneratedWorkbook, type GenerateInput } from "@/lib/workbook-generator";
import { workbookEditItem } from "@/lib/workbook-edit-item";
import { memoryWorkbookReview } from "@/lib/workbook-edit-memory";
import { runWorkbookEdit } from "@/lib/workbook-edit";
import { planWorkbook } from "@/lib/workbook-plan";
import { sampleChild, samplePlanInput } from "@/lib/workbook-sample-profiles";
import { WORKBOOK_INTERESTS } from "@/lib/workbook-interests";
import { interestEligible, printsInterest, templateSpotShown, warmUpShareProblems } from "@/lib/workbook-personal-items";
import { planNextWorkbook } from "@/lib/workbook-placement";
import { reviewDays } from "@/lib/workbook-review-days";
import { bookPersona, firstCustomerProfile, type BookPersona } from "@/lib/workbook-sample-profiles";
import { keySolver } from "@/lib/workbook-solve-check";
import type { WorkbookPlan } from "@/lib/workbook-plan";
import { THINGS } from "@/lib/workbook-wording";

const BC = curriculumFor("bc")!;
const DAYS = "1,6,9";
// Interest words no book uses without interests (today's lists hold some of them, "balls" and "pencils").
const TODAY = new Set([...THINGS, ...Object.values(BC.contexts ?? {}).flatMap((v) => Array.isArray(v) ? v.map((x) => typeof x === "string" ? x : "") : [])]);
const INTERESTS = [...new Set(Object.values(WORKBOOK_INTERESTS).flatMap((w) => [...w.things, ...w.places]))].filter((w) => !TODAY.has(w));
const words = (t: string) => t.trim().split(/\s+/).length;

/** A persona's fake book; `signals: false` makes the same plan's book with G1's personal choices off (today's items). */
const fakeDeps = (child: string, parent: string) => {
  let token = 0;
  return { ai: fakeAiClient({ answer: fakeWorkbookItems }), fit: { fits: async (page: { questions: unknown[] }) => page.questions.length <= 10 ? { ok: true as const } : { ok: false as const, problems: [{ question: null, reason: "test page holds at most ten questions" }] } },
    store: memoryDraftStore({ [child]: parent }), qrToken: () => `personal-token-${String(++token).padStart(8, "0")}`, solver: keySolver() };
};

async function book(profile: ReturnType<typeof firstCustomerProfile>, signals = true, days = DAYS): Promise<{ plan: WorkbookPlan; draft: GeneratedWorkbook; input: GenerateInput }> {
  const placed = planNextWorkbook({ curriculum: BC, grade: 4, profile, workbooks: [], number: 1 });
  if (!placed.ok) throw new Error(placed.reason);
  const plan = reviewDays(signals ? placed.plan : { ...placed.plan, personal: undefined }, days);
  return generated(plan);
}

async function generated(plan: WorkbookPlan): Promise<{ plan: WorkbookPlan; draft: GeneratedWorkbook; input: GenerateInput }> {
  const child = "00000000-0000-4000-8000-000000000071", parent = "00000000-0000-4000-8000-000000000001";
  const input: GenerateInput = { workbookId: "00000000-0000-4000-8000-0000000000a1", childId: child, number: 1, profileBuild: null, plan, curriculum: BC, itemPolicy: "approved-v1", book: { child: "Ava" } };
  const result = await generateWorkbook(input, fakeDeps(child, parent));
  if (result.status !== "stored") throw new Error(JSON.stringify(result));
  return { plan, draft: result.draft, input };
}

/** The visible features the spec compares (section 7), from the printed draft and its plan. */
function features(plan: WorkbookPlan, draft: GeneratedWorkbook) {
  const day = (n: number) => draft.pages.filter((p) => p.day === n);
  const questions = draft.pages.flatMap((p) => p.questions.map((q) => ({ page: p, q })));
  const blocks = draft.pages.flatMap((p) => (p.content?.kind === "day" ? p.content.blocks : []));
  const stories = questions.filter(({ q }) => ["word-problems", "picture-stories"].includes(q.place ?? "") && q.package).map(({ q }) => q.package!.text);
  return {
    start: `U${plan.level}:${plan.units.A.join(",")}`,
    // The PRINTED operations of the Day 1 to 5 warm-ups, never their skill labels (×3/4: a 3s or 4s table fact).
    warmUp: Object.entries(questions.filter(({ page, q }) => (page.day ?? 99) <= 5 && q.place === "warm-up" && q.package).reduce<Record<string, number>>((n, { q }) => {
      const op = q.package!.operation;
      const k = !op ? "none" : op.kind === "multiply" ? (op.operands.some((x) => x === 3 || x === 4) ? "×3/4" : "×") : op.kind;
      n[k] = (n[k] ?? 0) + 1;
      return n;
    }, {})).sort().map(([k, n]) => `${k}:${n}`).join(","),
    interestShare: (() => {
      const eligible = questions.filter(({ q }) => q.package && interestEligible(BC, q.itemPlan));
      return `${eligible.filter(({ q }) => printsInterest(plan, q.package!.text)).length}/${eligible.length}`;
    })(),
    spot: questions.filter(({ q }) => q.place === "spot-the-error").map(({ q }) => q.package?.wrongAnswers[0]?.cause ?? "").join(","),
    hard: questions.filter(({ q }) => q.place !== "challenge" && q.itemPlan?.template?.difficulty === "hard").length,
    watchOut: blocks.flatMap((b) => (b.explain?.startsWith("Watch out") ? [b.explain] : [])).join("|"),
    interests: questions.filter(({ q }) => q.package && INTERESTS.some((w) => q.package!.text.includes(w))).length,
    storyWords: Math.max(0, ...stories.map((t) => words(t))),
    longStories: stories.filter((t) => words(t) > 20).length,
    extra: blocks.filter((b) => b.extra).length,
    day1Size: Math.max(0, ...day(1).flatMap((p) => p.questions.flatMap((q) => (q.package?.text.match(/\d[\d,]*/g) ?? []).map((n) => Number(n.replace(/,/g, "")))))),
  };
}

const PERSONAS: BookPersona[] = ["ahead", "catch-up", "on-level", "rushed"];

describe("G1 persona books", () => {
  it("every pair of personas differs in at least 3 visible features, and each keeps its own", async () => {
    const made = new Map<string, ReturnType<typeof features>>(), todayMade = new Map<string, ReturnType<typeof features>>();
    for (const persona of PERSONAS) {
      const { plan, draft } = await book(bookPersona(persona).profile);
      made.set(persona, features(plan, draft));
      // No personal choice fails a question the same plan's book without them passes.
      const failed = (d: GeneratedWorkbook) => d.pages.flatMap((p) => p.questions.filter((q) => q.check.status === "failed").map((q) => `${p.type} d${p.day} ${q.place}: ${(q.check as { reason: string }).reason}`)).sort();
      const plainBook = await book(bookPersona(persona).profile, false);
      todayMade.set(persona, features(plainBook.plan, plainBook.draft));
      const today = failed(plainBook.draft);
      expect(failed(draft).filter((x) => { const i = today.indexOf(x); if (i >= 0) today.splice(i, 1); return i < 0; }), persona).toEqual([]);
    }
    const f = Object.fromEntries(made) as Record<BookPersona, ReturnType<typeof features>>;
    const today = Object.fromEntries(todayMade) as Record<BookPersona, ReturnType<typeof features>>;
    // (G1_FEATURES=<file> keeps the table for a review.)
    if (process.env.G1_FEATURES) writeFileSync(process.env.G1_FEATURES, JSON.stringify({ personal: f, today }, null, 1));
    // Ahead: U16 from the trusted level, the ×3 and ×4 facts in the warm-up.
    expect(f.ahead.start.startsWith("U16:")).toBe(true);
    const count = (warmUp: string, key: string) => Number(warmUp.split(",").find((x) => x.startsWith(`${key}:`))?.split(":")[1] ?? 0);
    const total = (warmUp: string) => warmUp.split(",").reduce((n, x) => n + Number(x.split(":")[1] ?? 0), 0);
    expect(count(f.ahead.warmUp, "×3/4") * 2).toBeGreaterThanOrEqual(total(f.ahead.warmUp));
    expect(count(today.ahead.warmUp, "×3/4")).toBe(0);
    // Catch up: reads with help (short stories where the step has them), under an hour a week (Extra blocks).
    expect(f["catch-up"].longStories).toBeLessThanOrEqual(today["catch-up"].longStories);
    expect(f["catch-up"].storyWords).toBeLessThanOrEqual(today["catch-up"].storyWords);
    expect(f["catch-up"].extra).toBeGreaterThan(0);
    // On level: sports and space words in its stories.
    expect(f["on-level"].interests).toBeGreaterThan(0);
    // The printed share of eligible code stories that name an interest: half to two thirds (item 5).
    for (const p of ["on-level", "catch-up"] as const) {
      const [named, eligible] = f[p].interestShare.split("/").map(Number);
      expect(eligible, p).toBeGreaterThanOrEqual(6);
      expect(named / eligible, p).toBeGreaterThanOrEqual(0.5);
      expect(named / eligible, p).toBeLessThanOrEqual(2 / 3);
    }
    expect(today["on-level"].interests).toBe(0);
    expect(f.ahead.interests).toBe(0);
    // Each persona's G1 book differs from its plan's book without the personal choices (the stretch, facts, words).
    for (const p of ["ahead", "on-level", "catch-up"] as const) expect(f[p], p).not.toEqual(today[p]);
    for (const [i, a] of PERSONAS.entries()) for (const b of PERSONAS.slice(i + 1)) {
      const differ = (Object.keys(f[a]) as (keyof ReturnType<typeof features>)[]).filter((k) => f[a][k] !== f[b][k]);
      expect(differ.length, `${a} and ${b} differ only in ${differ.join(", ")}`).toBeGreaterThanOrEqual(3);
    }
  }, 600_000);

  it("prints C2's verified Watch out pair for the child's own coded mistake, and today's line without it", async () => {
    const skill = "4.1-place-value-10000";
    const pair = curriculumFor("bc")!.skillSteps(skill)![1].mistakes.find((m) => m.misconception === "zero-placeholder")!.watchOut!;
    const withMistake = () => {
      const p = bookPersona("on-level").profile;
      const a = p.assessment!.profile;
      a.struggles.push({ ...a.standards.find((x) => x.code === "4.1")!, wrong: [{ questionId: "", templateId: "", prompt: "", response: "", rightAnswer: "", misconception: "zero-placeholder" }], misconceptions: ["zero-placeholder"] });
      return p;
    };
    const lines = async (profile: ReturnType<typeof firstCustomerProfile>) => {
      const placed = planNextWorkbook({ curriculum: BC, grade: 4, profile, workbooks: [], number: 1 });
      if (!placed.ok) throw new Error(placed.reason);
      const day = placed.plan.newSteps.find((x) => x.skill === skill && x.step === 2)!.day;
      const { draft } = await book(profile, true, String(day));
      return draft.pages.flatMap((p) => (p.content?.kind === "day" ? p.content.blocks : [])).flatMap((b) => (b.explain?.startsWith("Watch out") ? [b.explain] : []));
    };
    const own = await lines(withMistake());
    expect(own.some((l) => l.startsWith(`Watch out: ${pair.wrong.replace(/\.?$/, ".")}`))).toBe(true);
    const today = await lines(bookPersona("on-level").profile);
    expect(today.some((l) => l.includes(pair.wrong))).toBe(false);
  }, 600_000);

  // Codex's re-check reproduction (/tmp/pr585-recheck-report.md, P1 1): five Day 1 ×3/×4 facts edited to tens additions.
  it("refuses an admin edit that drops the warm-up below the fact-family share, and keeps one that stays in it", async () => {
    const { plan, draft, input } = await book(firstCustomerProfile(), true, "1");
    const page = draft.pages.find((p) => p.day === 1 && p.type === "warm-up")!;
    const targets = page.questions.filter((q) => q.package?.operation?.kind === "multiply").slice(0, 5);
    expect(targets).toHaveLength(5);
    const items = Object.fromEntries(targets.map((q, i) => {
      const item = workbookEditItem(q)!;
      item.text = `${20 + i * 10} + 20 = ?`; item.skill = "5.8-extend-facts"; item.operation!.kind = "add";
      item.operation!.operands = item.operation!.operands.map((v, k) => ({ ...v, value: k ? 20 : 20 + i * 10 })); item.easier = null;
      return [q.number, item];
    }));
    const deps = fakeDeps(input.childId, "parent");
    await expect(reviseWorkbookPage(input, deps, page, { question: targets.map((q) => q.number), note: "Change the numbers.", items })).rejects.toThrow(/This edit was not saved: Day 1's warm-up has \d+ of \d+ facts the child still needs to practise/);
    // Through the edit job: the comments fail with the plain reason and no revision is saved.
    const snapshot = { draft, rendering: { pdfPath: "old.pdf", pdfSha256: null, pages: draft.pages.map((p) => ({ number: p.number, image: { path: `old-${p.number}.png`, width: 816, height: 1056 }, questions: [] })) }, problems: [], revision: 1, input, parentId: "parent" };
    const review = memoryWorkbookReview(snapshot as never);
    for (const q of targets) review.save({ draftId: draft.id, revision: 1, page: page.number, question: q.number, x: .2, y: .2, note: "Change the numbers.", item: items[q.number], actor: { id: "admin", email: "admin@example.com" }, createdAt: "2026-11-05T00:00:00Z" });
    const sent = review.send(1, "mac");
    if (sent.status !== "queued") throw new Error(sent.reason);
    const job = { store: review.store, runner: "mac" as const, newId: () => "lease", generation: deps,
      renderPage: async (_s: unknown, _d: unknown, n: number) => ({ page: { number: n, image: { path: "new.png", width: 816, height: 1056 }, questions: [] }, paths: [] }),
      assemble: async () => ({ pdfPath: "new.pdf", paths: [] }), remove: async () => {} };
    expect(await runWorkbookEdit(sent.id, job as never)).toBe("failed");
    expect(review.snapshot().revision).toBe(1);
    expect(warmUpShareProblems(BC, plan, review.snapshot().draft.pages)).toEqual([]);
    // One fact edited to another ×4 fact keeps the share and is accepted.
    const one = targets[0];
    const same = workbookEditItem(one)!;
    same.text = "4 × 9 = ?"; same.operation!.operands = same.operation!.operands.map((v, k) => ({ ...v, value: k ? 9 : 4 }));
    const kept = await reviseWorkbookPage(input, deps, page, { question: one.number, note: "Change the numbers.", items: { [one.number]: same } });
    expect(kept.questions.find((q) => q.number === one.number)!.package!.text).toBe("4 × 9 = ?");
  }, 600_000);

  // Codex's re-check reproduction (P1 2): U13 with 4.4 weak and O3; Day 7's first Spot the error cannot show the carry.
  it("gives the day's personal Spot the error to the first sum that admits the child's verified mistake", async () => {
    const sample = samplePlanInput(BC, sampleChild(BC, "U13")!, "first");
    sample.profile = { standards: sample.profile.standards.map((s) => ({ ...s, status: s.code === "4.4" ? "needs-attention" as const : "secure" as const })) };
    const planned = planWorkbook(sample);
    if (!planned.ok) throw new Error(planned.reason);
    const first = planNextWorkbook({ curriculum: BC, grade: 4, profile: firstCustomerProfile(), workbooks: [], number: 1 });
    if (!first.ok) throw new Error(first.reason);
    const signals = first.plan.personal!;
    const plan: WorkbookPlan = { ...planned.plan, personal: { ...signals, mistakes: [{ standard: "4.4", misconceptions: ["O3"], stuckSteps: [], wrong: 1, withHelp: 0, blank: 0, hints: 0 }], adjustments: { ...signals.adjustments, stretchShift: 0 } } };
    const { draft } = await generated(reviewDays(plan, "7"));
    const spots = draft.pages.flatMap((p) => p.questions.filter((q) => q.place === "spot-the-error" && q.itemPlan?.template).map((q) => {
      const t = q.itemPlan!.template!;
      const shown = (q.package?.item?.checks ?? []).find((c) => c.kind === "template-shown") as { shown?: string } | undefined;
      return { page: p.number, shown: shown?.shown ?? null, own: templateSpotShown(BC, plan, t.skill, t.step, q.package!.text) };
    }));
    const eligible = spots.filter((x) => x.own !== null);
    expect(eligible.length).toBeGreaterThan(0);
    // The first sum that admits the mistake shows it; the day shows it once.
    expect(eligible[0].shown).toBe(String(eligible[0].own));
    expect(spots.filter((x) => x.own !== null && x.shown === String(x.own))).toHaveLength(1);
  }, 600_000);
});
