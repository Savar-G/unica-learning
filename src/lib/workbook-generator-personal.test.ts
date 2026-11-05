// G1 (docs/workbook-personalization.md section 7): each persona's fake book against a fixed set of visible features.
// Fake AI, the key solver and a fit check that holds ten questions a page: no browser, no network.
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakeWorkbookItems } from "@/lib/workbook-ai-fake";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { generateWorkbook, type GeneratedWorkbook } from "@/lib/workbook-generator";
import { WORKBOOK_INTERESTS } from "@/lib/workbook-interests";
import { interestEligible, printsInterest } from "@/lib/workbook-personal-items";
import { planNextWorkbook } from "@/lib/workbook-placement";
import { reviewDays } from "@/lib/workbook-review-days";
import { bookPersona, firstCustomerProfile, type BookPersona } from "@/lib/workbook-sample-profiles";
import { keySolver } from "@/lib/workbook-solve-check";
import type { WorkbookPlan } from "@/lib/workbook-plan";
import { THINGS } from "@/lib/workbook-wording";
import { curriculumVersion } from "@/lib/workbook-curriculum";
import { skillUnits } from "@/lib/workbook-teaching-frame";
import { teachingContext } from "@/lib/workbook-print-contract";
import { masteryCoverageMarkdown } from "../../scripts/workbook-sample-pages";

const BC = curriculumFor("bc")!;
const DAYS = "1,6,9";
// Interest words no book uses without interests (today's lists hold some of them, "balls" and "pencils").
const TODAY = new Set([...THINGS, ...Object.values(BC.contexts ?? {}).flatMap((v) => Array.isArray(v) ? v.map((x) => typeof x === "string" ? x : "") : [])]);
const INTERESTS = [...new Set(Object.values(WORKBOOK_INTERESTS).flatMap((w) => [...w.things, ...w.places]))].filter((w) => !TODAY.has(w));
const words = (t: string) => t.trim().split(/\s+/).length;

/** A persona's fake book; `signals: false` makes the same plan's book with G1's personal choices off (today's items). */
async function book(profile: ReturnType<typeof firstCustomerProfile>, signals = true, days = DAYS): Promise<{ plan: WorkbookPlan; draft: GeneratedWorkbook }> {
  const placed = planNextWorkbook({ curriculum: BC, grade: 4, profile, workbooks: [], number: 1 });
  if (!placed.ok) throw new Error(placed.reason);
  const plan = reviewDays(signals ? placed.plan : { ...placed.plan, personal: undefined }, days);
  const child = "00000000-0000-4000-8000-000000000071", parent = "00000000-0000-4000-8000-000000000001";
  let token = 0;
  const result = await generateWorkbook(
    { workbookId: "00000000-0000-4000-8000-0000000000a1", childId: child, number: 1, profileBuild: null, plan, curriculum: BC, itemPolicy: "approved-v1", book: { child: "Ava" } },
    { ai: fakeAiClient({ answer: fakeWorkbookItems }), fit: { fits: async (page) => page.questions.length <= 10 ? { ok: true } : { ok: false, problems: [{ question: null, reason: "test page holds at most ten questions" }] } },
      store: memoryDraftStore({ [child]: parent }), qrToken: () => `personal-token-${String(++token).padStart(8, "0")}`, solver: keySolver() },
  );
  if (result.status !== "stored") throw new Error(JSON.stringify(result));
  return { plan, draft: result.draft };
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
      if (persona === "ahead") {
        const frame = { curriculum: "bc", curriculumVersion: curriculumVersion("bc")!, plan, units: skillUnits(BC) };
        const facts = draft.pages.flatMap(p => p.questions.filter(q => q.place === "warm-up" && q.package?.operation?.kind === "multiply").map(q => ({ p, q })));
        expect(facts.length).toBeGreaterThan(0);
        for (const { p, q } of facts) {
          expect(q.itemStep).toEqual({ unit: "5.9", skill: "5.9-recall-facts", step: 1 });
          expect(teachingContext(frame, p, { ...q, package: q.package! })).toMatchObject({ plannedStep: null, itemStep: q.itemStep, eligibility: { mastery: true } });
        }
        const all = draft.pages.flatMap(p => p.questions.map(q => q.package ? teachingContext(frame, p, { ...q, package: q.package }) : null));
        expect(masteryCoverageMarkdown(draft, frame)).toContain(`| All | ${all.length} | ${all.filter(t => !t?.eligibility.mastery).length} |`);
      }
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
});
