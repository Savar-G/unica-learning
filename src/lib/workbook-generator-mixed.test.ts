import { expect, it } from "vitest";
import { fakeAiClient } from "./ai-client-fake";
import { fakeWorkbookItems } from "./workbook-ai-fake";
import { curriculumFor } from "./workbook-curriculum";
import { memoryDraftStore } from "./workbook-draft-memory";
import { generateWorkbook } from "./workbook-generator";
import { planWorkbook } from "./workbook-plan";
import { reviewDays } from "./workbook-review-days";
import { sampleChild, samplePlanInput } from "./workbook-sample-profiles";
import { keySolver } from "./workbook-solve-check";
import { workbookTemplate } from "./workbook-template";
import { workbookQuality } from "./workbook-quality";
import { checkQuestionPackage } from "./question-package";
import { stepTemplateOf } from "./workbook-step-items";
import { regionNames } from "./workbook-render";
import { renderWorkbook } from "./workbook-render";
import { renderableDraft } from "./workbook-fit";
import { chromiumPrintEngine, findChromium } from "./print-engine-chromium";
import { fixedTemplateFonts } from "./workbook-template-fonts";

const curriculum = curriculumFor("bc")!;
async function mixedDraft() {
  const child = sampleChild(curriculum, "U16")!;
  const childId = "00000000-0000-4000-8000-000000000071", parentId = "00000000-0000-4000-8000-000000000001";
  const planned = planWorkbook(samplePlanInput(curriculum, child, "first"));
  if (!planned.ok) throw new Error(planned.reason);
  let token = 0;
  const generated = await generateWorkbook({
    workbookId: "17fc5da1-2442-488a-a450-611a471e73e6", childId, number: 1, profileBuild: null,
    plan: reviewDays(planned.plan, "1"), curriculum, itemPolicy: "approved-v1", book: { child: "Mateo" },
  }, {
    ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(), store: memoryDraftStore({ [childId]: parentId }),
    qrToken: () => `mixed-token-${String(++token).padStart(12, "0")}`,
    fit: { fits: async p => p.questions.length <= 10 ? { ok: true } : { ok: false, problems: [{ question: null, reason: "ten-question test capacity" }] } },
  });
  if (generated.status !== "stored") throw new Error(generated.status);
  return generated.draft;
}

it("prints each generated U16 Mixed set story with operation choices, answer and work, and rejects missing fields", async () => {
  const draft = await mixedDraft();
  const page = draft.pages.find(p => p.questions.some(q => q.place === "mixed-set"))!;
  expect(page).toBeTruthy();
  const questions = page.questions.filter(q => q.place === "mixed-set");
  expect(questions.length).toBeGreaterThanOrEqual(2);
  for (const q of questions) {
    expect(q.check.status).toBe("checked");
    const pkg = q.package!;
    expect(pkg.textSource).toBe("code");
    expect(pkg.item!.format).toBe("tick-and-number");
    expect(pkg.item!.regions.map(r => r.kind)).toEqual(["choice", "box", "work"]);
    expect(pkg.item!.regions[0]).toMatchObject({ mark: "tick", choices: ["+", "−", "×", "÷"] });
    expect(checkQuestionPackage(pkg).status).toBe("checked");
    const selected = stepTemplateOf(pkg)!;
    expect(q.itemStep).toEqual({ unit: curriculum.skill(selected.skill)!.unit, skill: selected.skill, step: selected.step });
    expect(q.stepDeclaration?.source).toBe("template");
  }
  const html = workbookTemplate().page({ ...page, questions: page.questions.map(q => ({ number: q.number, package: q.package! })) }, { qr: "", qrUrl: "" }, renderableDraft(draft))!;
  expect(html.match(/Tick the operation:/g)).toHaveLength(questions.length);
  expect(html.match(/Write the answer:/g)).toHaveLength(questions.length);
  expect(html).not.toContain("Answer each question.");
  for (const q of questions) for (const r of regionNames({ number: q.number, package: q.package! })) expect(html).toContain(`data-measure="${r.name}"`);
  expect(workbookQuality([page]).issues.filter(i => /Mixed set/.test(i.reason))).toEqual([]);
  for (const missing of ["choice", "box", "work"] as const) {
    const broken = structuredClone(page);
    const q = broken.questions.find(q => q.place === "mixed-set")!;
    q.package!.item!.regions = q.package!.item!.regions.filter(r => r.kind !== missing);
    const quality = workbookQuality([broken]);
    expect(quality.ready).toBe(false);
    expect(quality.issues).toContainEqual(expect.objectContaining({ kind: "coverage", reason: expect.stringMatching(/Mixed set/) }));
  }
  const wrongSign = structuredClone(page);
  const choice = wrongSign.questions.find(q => q.place === "mixed-set")!.package!.item!.regions[0];
  if (choice.kind !== "choice") throw new Error("not an operation choice");
  choice.answer = choice.choices.find(s => s !== choice.answer)!;
  expect(workbookQuality([wrongSign]).issues).toContainEqual(expect.objectContaining({ reason: expect.stringMatching(/Mixed set/) }));
}, 30_000);

it.skipIf(!await findChromium())("strictly renders the generated Mixed set in Chromium with two complete cards and measured answer/work regions", async () => {
  const generated = await mixedDraft();
  const selected = generated.pages.find(p => p.questions.some(q => q.place === "mixed-set"))!;
  const keep = new Set(selected.questions.filter(q => q.place === "mixed-set").slice(0, 2).map(q => q.number));
  selected.questions = selected.questions.filter(q => q.place !== "mixed-set" || keep.has(q.number));
  if (selected.content?.kind !== "day") throw new Error("not a day page");
  for (const block of selected.content.blocks) block.items = block.items.filter(n => selected.questions.some(q => q.number === n));
  const draft = renderableDraft({ ...generated, pages: [selected] });
  let measured: Awaited<ReturnType<ReturnType<typeof chromiumPrintEngine>["print"]>>["measured"] = [];
  const engine = chromiumPrintEngine();
  const result = await renderWorkbook({ draft, parentId: "00000000-0000-4000-8000-000000000001", template: workbookTemplate(await fixedTemplateFonts()),
    engine: { print: async job => { const output = await engine.print(job); measured = output.measured; return output; } },
  });
  expect(result.status === "failed" ? result.problems : []).toEqual([]);
  expect(result.status).toBe("rendered");
  for (const q of draft.pages[0].questions.filter(q => keep.has(q.number))) for (const r of regionNames(q)) {
    const box = measured.find(m => m.name === r.name)!;
    expect(box.visible).toBe(true);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThanOrEqual(r.region.kind === "work" ? 64 : r.region.kind === "box" ? 48 : 20);
  }
}, 60_000);
