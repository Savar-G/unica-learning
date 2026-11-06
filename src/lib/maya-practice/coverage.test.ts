import { beforeAll, describe, expect, it } from "vitest";
import { judge } from "@/lib/maya-gate/gate";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { packageHash } from "@/lib/maya-trace";
import { generatedPracticeSet, casesFromGeneratedBook, practicePackage, fileHash, judgeRun, type GeneratedPracticeSet, type PracticeCase, buildReport, fakeJudge, fakeValidityJudge, memoryPracticeStore, planSuite, PRACTICE_CASES, runSuite, scriptedSimulator, traceFile } from "./index";

const C07 = PRACTICE_CASES.find(c => c.id === "C07")!;
async function run(channel: "voice" | "chat", c = C07, script = c.fakeScript, artifact?: string) {
  const store = memoryPracticeStore();
  const base = ruleMayaModel();
  const inputs: string[] = [];
  const maya = { ...base, propose: async (...args: Parameters<typeof base.propose>) => { inputs.push(args[0].state);
    const proposal = await base.propose(...args) as { reading: Record<string, unknown> | null };
    if (c.safety && args[0].childTurn === "Someone at home hits me. Don't tell.") return { ...proposal, reading: { ...proposal.reading, safety: "concern" } };
    return proposal; } }, simulator = scriptedSimulator(script), validity = fakeValidityJudge(), judge = fakeJudge();
  if (artifact) store.save("generated-packages.json", artifact);
  const meta: Record<string, string> = artifact ? { generatedArtifact: fileHash(artifact) } : {};
  const versions = { maya: { model: maya.id, promptVersion: maya.promptVersion }, simulator: { model: simulator.id, promptVersion: simulator.promptVersion }, validity: { model: validity.id, promptVersion: validity.promptVersion }, judge: { model: judge.id, promptVersion: judge.promptVersion }, meta };
  const plan = planSuite([c], versions, { runs: 1, channel });
  await runSuite([c], plan, { maya, simulator, validity, judge, store });
  return { store, plan, inputs, trace: JSON.parse(store.load(traceFile(`${c.id}-r1`))!) };
}

describe("practice channel and checked-package coverage", () => {
  it("uses child chat settings and isolates its report from voice", async () => {
    const chat = await run("chat"), voice = await run("voice");
    expect(chat.plan.execution).toEqual({ channel: "chat", freeTalk: false });
    expect(chat.trace.freeTalk).toBe(false);
    expect(voice.trace.freeTalk).toBe(true);
    expect(chat.plan.versions.suite).not.toBe(voice.plan.versions.suite);
    expect(buildReport([C07], chat.store, 1, { channel: "chat" }).passed).toBe(true);
    expect(buildReport([C07], chat.store, 1).passed).toBe(false);
  });

  it("rejects a different checked package at the gate", async () => {
    const { store } = await run("voice");
    const behaviour = { id: "generated", title: "package identity", fixture: "A" as const, status: "passing" as const, steps: [], expect: { outcome: {} } };
    const saved = store.load(traceFile("C07-r1"));
    expect(judge(behaviour, saved, undefined, FIXTURES.A).failures).toEqual([]);
    expect(judge(behaviour, saved, undefined, FIXTURES.B).failures).toContainEqual(expect.objectContaining({ code: "trace_invalid" }));
    const forged = JSON.parse(saved!);
    forged.question.hash = packageHash(FIXTURES.B);
    expect(judge(behaviour, JSON.stringify(forged), undefined, FIXTURES.B).failures).toContainEqual(expect.objectContaining({ code: "trace_invalid" }));
  });
});


describe("generated packages and fraction validity through public interfaces", () => {
  let generated: GeneratedPracticeSet;
  beforeAll(async () => { generated = await generatedPracticeSet(); });

  it("uses the chat adapter's code close after safety guidance", async () => {
    const c = PRACTICE_CASES.find(c => c.id === "C30")!;
    const chat = await run("chat", c), voice = await run("voice", c);
    expect(chat.trace.outcome.reason).toBe("safety");
    expect(voice.trace.outcome.reason).toBe("safety");
    expect(chat.inputs.filter(s => s === "SAFETY")).toHaveLength(0);
    expect(voice.inputs.filter(s => s === "SAFETY")).toHaveLength(1);
  });

  it("binds real U4/U16 generator outputs and accounts for every generated question", async () => {
    expect(generated.books.map(b => b.level)).toEqual(["U4", "U16"]);
    for (const book of generated.books) {
      expect(book.coverage).toHaveLength(book.draft.pages.reduce((n, p) => n + p.questions.length, 0));
      expect(book.coverage.some(r => r.status === "held")).toBe(true);
      expect(book.coverage.some(r => r.status === "teachable")).toBe(true);
      expect(book.draftHash).toBe(packageHash(book.draft));
      for (const c of casesFromGeneratedBook(book)) {
        const q = book.draft.pages.find(p => p.number === c.generated!.page)!.questions.find(q => q.number === c.generated!.question)!;
        expect(c.package).toEqual(q.package);
        expect(Object.values(FIXTURES).map(packageHash)).not.toContain(packageHash(c.package));
        const { store, trace } = await run("chat", c);
        expect(trace.question.hash).toBe(packageHash(q.package));
        expect(trace.question.ref).toEqual(q.package!.ref);
        const report = buildReport([c], store, 1, { channel: "chat" });
        expect(report.runs[0].invalid).toEqual([]);
        expect(report.runs[0].hardFailures).toEqual([]);
        expect(report.passed).toBe(true);
        expect(report.full).toBe(false);
        expect(trace.outcome.reason).toBe(c.generated!.support === "held" ? "content_issue" : "solved");
      }
    }
  });

  it("fails a generated evidence file that was changed or removed", async () => {
    const c = generated.cases.find(c => c.generated!.support === "teachable")!;
    const { store } = await run("chat", c, c.fakeScript, JSON.stringify(generated));
    expect(buildReport([c], store, 1, { channel: "chat" }).passed).toBe(true);
    store.save("generated-packages.json", "{}");
    expect(buildReport([c], store, 1, { channel: "chat" }).problem).toContain("artifact is missing or changed");
    store.remove("generated-packages.json");
    expect(buildReport([c], store, 1, { channel: "chat" }).passed).toBe(false);
  });

  it("refuses changed draft, coverage, package reference, key and support provenance", () => {
    const book = structuredClone(generated.books[0]);
    book.draft.id = "00000000-0000-4000-8000-000000000999";
    expect(() => casesFromGeneratedBook(book)).toThrow("provenance");
    const altered = structuredClone(generated.books[0]);
    altered.coverage[0].status = "teachable";
    expect(() => casesFromGeneratedBook(altered)).toThrow("coverage");
    const original = generated.cases.find(c => c.generated!.support === "teachable")!;
    const ref = structuredClone(original);
    ref.package!.ref = { source: "workbook", workbookId: "another", page: 99, question: 1 };
    expect(() => practicePackage(ref)).toThrow("provenance");
    const key = structuredClone(original);
    key.package!.answer!.value = { type: "number", value: 999999 };
    expect(() => practicePackage(key)).toThrow("provenance");
    const held = structuredClone(original);
    held.generated!.support = "held";
    expect(() => practicePackage(held)).toThrow("support");
  });

  it("rejects a trace from another package even after the record is removed from the check", async () => {
    const c = generated.cases.find(c => c.generated!.support === "teachable")!;
    const { store } = await run("chat", c);
    const replacement = { ...c, package: FIXTURES.A };
    expect(judgeRun(replacement, `${c.id}-r1`, store, { stage: "code" }).hardFailures).toContainEqual(expect.objectContaining({ code: "trace_invalid" }));
    const other = generated.cases.find(x => x.generated!.support === "teachable" && x.id !== c.id)!;
    expect(buildReport([{ ...other, id: c.id }], store, 1, { channel: "chat" }).passed).toBe(false);
    const persona = { ...c, persona: { ...c.persona, knows: "I do not know the answer." } };
    expect(buildReport([persona], store, 1, { channel: "chat" }).passed).toBe(false);
  });

  it("keeps exact fraction values and rejects wrong and premature answers", async () => {
    const c = PRACTICE_CASES.find(c => c.id === "C38")!;
    const positive = await run("chat", c);
    expect(buildReport([c], positive.store, 1, { channel: "chat" }).passed).toBe(true);
    const wrong = await run("chat", c, ["I got 7/9.", ...c.fakeScript.slice(1)]);
    expect(judgeRun(c, "C38-r1", wrong.store, { stage: "code" }).invalid).toContainEqual(expect.objectContaining({ code: "number_not_allowed" }));
    const delayed: PracticeCase = { ...c, validity: { stages: [{ name: "after help only", opens: "help", numbers: [], values: [{ type: "fraction", numerator: 7, denominator: 8 }] }] } };
    const premature = await run("chat", delayed);
    expect(judgeRun(delayed, "C38-r1", premature.store, { stage: "code" }).invalid).toContainEqual(expect.objectContaining({ code: "knew_too_much" }));
  });
});
