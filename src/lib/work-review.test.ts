import { afterEach, describe, expect, it, vi } from "vitest";
import { reportModel, type ReviewResult, type ShownWork } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { REVIEW_MAX, aiReport, aiReviewer, type ReviewInput, type ReviewPiece, type ReviewStore, type StoredReview, type WorkReviewer } from "@/lib/work-review";
import { fakeReviewer } from "@/lib/work-review-fake";

afterEach(() => vi.restoreAllMocks());

describe("the AI switch (#68): on only with ANTHROPIC_API_KEY", () => {
  it("is off without a key, so no AI call can happen", () => {
    expect(aiReviewer({})).toBeNull();
    expect(aiReviewer({ ANTHROPIC_API_KEY: "" })).toBeNull();
    expect(aiReviewer({ ANTHROPIC_API_KEY: "   " })).toBeNull();
  });

  it("is on with a key, with the model from AI_REVIEW_MODEL or Claude Sonnet 5.5 by default", () => {
    expect(aiReviewer({ ANTHROPIC_API_KEY: "sk-ant-test" })?.model).toBe("claude-sonnet-5-5");
    expect(aiReviewer({ ANTHROPIC_API_KEY: "sk-ant-test", AI_REVIEW_MODEL: "claude-opus-5-5" })?.model).toBe("claude-opus-5-5");
  });

  it("gives the dev fake only outside production, for screenshots of a report with comments", () => {
    expect(aiReviewer({ AI_REVIEW_FAKE: "sure", NODE_ENV: "development" })?.model).toBe("fake");
    expect(aiReviewer({ AI_REVIEW_FAKE: "unsure", NODE_ENV: "development" })?.model).toBe("fake");
    expect(aiReviewer({ AI_REVIEW_FAKE: "sure", NODE_ENV: "production" })).toBeNull();
    expect(aiReviewer({ AI_REVIEW_FAKE: "sure", NODE_ENV: "production", ANTHROPIC_API_KEY: "sk-ant-test" })?.model).toBe("claude-sonnet-5-5");
    expect(aiReviewer({ AI_REVIEW_FAKE: "yes", NODE_ENV: "development" })).toBeNull();
  });
});

// A grade 4 child who works at grade 4, and the work they showed.
const placement = takeTest({ grade: 4, province: "BC" }, 1, knowsUpTo(4)).placement;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

const piece = (questionId: string, extra: Partial<ReviewPiece> = {}): ReviewPiece => ({
  questionId,
  prompt: "47 + 38 = ?",
  answer: "715",
  rightAnswer: "85",
  correct: false,
  level: 4,
  required: true,
  misconception: null,
  image: `parent/test/${questionId}.png`,
  text: null,
  ...extra,
});
const shownWork = (pieces: ReviewPiece[]): ShownWork[] => pieces.map(({ questionId, prompt, correct, required, image, text }) => ({ questionId, prompt, correct, required, image, text }));

function memoryStore(stored: StoredReview[] = []) {
  const calls = { stored: 0, saved: [] as StoredReview[], images: [] as string[] };
  const store: ReviewStore = {
    stored: async () => (calls.stored++, stored),
    save: async (reviews) => void calls.saved.push(...reviews),
    image: async (path) => (calls.images.push(path), PNG),
  };
  return { store, calls };
}

const sureResult: ReviewResult = { errorType: "regrouping", kind: "misunderstanding", comment: "Added each column but did not carry the 1.", score: 0.9 };

function run(reviewer: WorkReviewer | null, pieces: ReviewPiece[], store: ReviewStore, times: { reviewMs?: number; textMs?: number } = {}) {
  return aiReport({
    reviewer,
    pieces: async () => pieces,
    store,
    build: (workReviews, reportText) => reportModel(placement, { completedTestsInGrade: 0, workReviews, shownWork: shownWork(pieces), reportText }),
    ...times,
  });
}

describe("the AI step of the report job (#68)", () => {
  it("off (key unset): no AI call, no work loaded, nothing stored, and the report has no AI parts", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const loadPieces = vi.fn(async () => [piece("s1-3")]);
    const { store, calls } = memoryStore();
    const { model, ai } = await aiReport({
      reviewer: aiReviewer({ NODE_ENV: "production" }),
      pieces: loadPieces,
      store,
      build: (workReviews, reportText) => reportModel(placement, { completedTestsInGrade: 0, workReviews, shownWork: shownWork([piece("s1-3")]), reportText }),
    });
    expect(ai).toEqual({ on: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(loadPieces).not.toHaveBeenCalled();
    expect(calls).toEqual({ stored: 0, saved: [], images: [] });
    expect(model).not.toHaveProperty("summary");
    expect(model.work).toEqual([{ questionId: "s1-3", prompt: "47 + 38 = ?", correct: false, image: "parent/test/s1-3.png", text: null, comment: null }]);
  });

  it("a sure review shows its comment; a low-confidence one keeps the image and drops the comment; both are stored", async () => {
    const pieces = [piece("s1-3"), piece("s1-5", { prompt: "63 - 28 = ?" })];
    const reviewer = fakeReviewer({ review: (input) => (input.prompt === "47 + 38 = ?" ? sureResult : { ...sureResult, comment: "Took 3 from 8.", score: 0.5 }) });
    const { store, calls } = memoryStore();
    const { model, ai } = await run(reviewer, pieces, store);
    expect(model.work.map((w) => [w.questionId, w.image, w.comment])).toEqual([
      ["s1-3", "parent/test/s1-3.png", "Added each column but did not carry the 1."],
      ["s1-5", "parent/test/s1-5.png", null],
    ]);
    expect(calls.saved).toEqual([
      { questionId: "s1-3", errorType: "regrouping", kind: "misunderstanding", comment: "Added each column but did not carry the 1.", confidence: "high", score: 0.9, model: "fake" },
      { questionId: "s1-5", errorType: "regrouping", kind: "misunderstanding", comment: "Took 3 from 8.", confidence: "low", score: 0.5, model: "fake" },
    ]);
    expect(ai).toMatchObject({ on: true, model: "fake", pieces: 2, reviewed: 2, sure: 1, failed: 0, skipped: 0, saved: true });
  });

  it("the reviewer gets the question, the answers, the mark and the work: no name and no ids", async () => {
    const inputs: ReviewInput[] = [];
    const reviewer = fakeReviewer({ review: (input) => (inputs.push(input), sureResult) });
    const { store, calls } = memoryStore();
    await run(reviewer, [piece("s1-3", { misconception: "Forgets to carry when adding", text: "47+38" })], store);
    expect(calls.images).toEqual(["parent/test/s1-3.png"]);
    expect(inputs).toEqual([
      { prompt: "47 + 38 = ?", answer: "715", rightAnswer: "85", correct: false, level: 4, misconception: "Forgets to carry when adding", text: "47+38", png: PNG },
    ]);
  });

  it("keeps report text that uses only the model's numbers, with the name as a placeholder", async () => {
    const reviewer = fakeReviewer({ review: () => sureResult, reportText: () => "{name} is working at a grade 4 level, the same as the school grade." });
    const { model, ai } = await run(reviewer, [piece("s1-3")], memoryStore().store);
    expect(model.summary).toBe("{name} is working at a grade 4 level, the same as the school grade.");
    expect(ai).toMatchObject({ text: { kept: true } });
  });

  it("rejects report text with a number that is not in the model, and the report keeps its plain sentences", async () => {
    const reviewer = fakeReviewer({ review: () => sureResult, reportText: () => "{name} got 97% of the grade 4 questions right." });
    const { model, ai } = await run(reviewer, [piece("s1-3")], memoryStore().store);
    expect(model).not.toHaveProperty("summary");
    expect(model.work[0].comment).toBe("Added each column but did not carry the 1.");
    expect(ai).toMatchObject({ text: { kept: false, problem: "number", detail: "97" } });
  });

  it("the fake's unsure mode gives image-only work and rejected text, as the dev screenshots show", async () => {
    const { model, ai } = await run(fakeReviewer({ mode: "unsure" }), [piece("s1-3"), piece("s1-5")], memoryStore().store);
    expect(model.work.map((w) => w.comment)).toEqual([null, null]);
    expect(model).not.toHaveProperty("summary");
    expect(ai).toMatchObject({ sure: 0, reviewed: 2, text: { kept: false, problem: "number" } });
    const sure = await run(fakeReviewer({ mode: "sure" }), [piece("s1-3"), piece("s1-5")], memoryStore().store);
    expect(sure.model.work.every((w) => w.comment)).toBe(true);
    expect(sure.model.summary).toMatch(/is the strongest area for \{name\}, with \d+ of \d+ right\./);
    expect(sure.model.summary).toContain("On the whiteboard, {name}'s work on 47 + 38 shows where a step went wrong.");
  });

  it("a review that fails is left out; the others stay, and the report still builds", async () => {
    const reviewer = fakeReviewer({
      review: (input) => {
        if (input.prompt === "63 - 28 = ?") throw new Error("API answered 500");
        return sureResult;
      },
      reportText: () => {
        throw new Error("API answered 529");
      },
    });
    const { store, calls } = memoryStore();
    const { model, ai } = await run(reviewer, [piece("s1-3"), piece("s1-5", { prompt: "63 - 28 = ?" })], store);
    expect(model.work.map((w) => w.comment)).toEqual(["Added each column but did not carry the 1.", null]);
    expect(model).not.toHaveProperty("summary");
    expect(calls.saved.map((r) => r.questionId)).toEqual(["s1-3"]);
    expect(ai).toMatchObject({ reviewed: 1, failed: 1, text: { kept: false, problem: "failed", detail: "API answered 529" } });
  });

  it("AI that does not answer in time: the report builds without the AI parts", async () => {
    const never = new Promise<never>(() => {});
    const reviewer = fakeReviewer({ review: () => never, reportText: () => never });
    const { store, calls } = memoryStore();
    const started = Date.now();
    const { model, ai } = await run(reviewer, [piece("s1-3"), piece("s1-5")], store, { reviewMs: 30, textMs: 30 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(model.work.map((w) => w.comment)).toEqual([null, null]);
    expect(model).not.toHaveProperty("summary");
    expect(calls.saved).toEqual([]);
    expect(ai).toMatchObject({ reviewed: 0, failed: 2, text: { kept: false, problem: "failed" } });
  });

  it("uses the reviews an earlier run stored, and asks only for the rest", async () => {
    const earlier: StoredReview = { questionId: "s1-3", errorType: "regrouping", kind: "slip", comment: "Copied 38 as 83.", confidence: "high", score: 0.95, model: "fake" };
    const asked: string[] = [];
    const reviewer = fakeReviewer({ review: (input) => (asked.push(input.prompt), sureResult) });
    const { store, calls } = memoryStore([earlier]);
    const { model, ai } = await run(reviewer, [piece("s1-3"), piece("s1-5", { prompt: "63 - 28 = ?" })], store);
    expect(asked).toEqual(["63 - 28 = ?"]);
    expect(calls.saved.map((r) => r.questionId)).toEqual(["s1-5"]);
    expect(model.work[0].comment).toBe("Copied 38 as 83.");
    expect(ai).toMatchObject({ reviewed: 2, sure: 2, failed: 0 });
  });

  it(`reviews show-your-work questions first, then optional work, at most ${REVIEW_MAX}`, async () => {
    const optional = [piece("s1-1", { required: false }), piece("s1-2", { required: false })];
    const required = Array.from({ length: REVIEW_MAX - 1 }, (_, i) => piece(`r-${i}`));
    const asked: string[] = [];
    const reviewer = fakeReviewer({ review: (input) => (asked.push(input.prompt), sureResult) });
    const { store, calls } = memoryStore();
    const pieces = [...optional, ...required].map((p) => ({ ...p, prompt: p.questionId }));
    const { ai } = await run(reviewer, pieces, store);
    expect(asked).toHaveLength(REVIEW_MAX);
    expect(new Set(calls.saved.map((r) => r.questionId))).toEqual(new Set([...required.map((p) => p.questionId), "s1-1"]));
    expect(ai).toMatchObject({ pieces: REVIEW_MAX + 1, reviewed: REVIEW_MAX, skipped: 1 });
  });

  it("stores a score outside 0 to 1 in range, as not sure", async () => {
    const { store, calls } = memoryStore();
    await run(fakeReviewer({ review: () => ({ ...sureResult, score: 1.5 }) }), [piece("s1-3")], store);
    await run(fakeReviewer({ review: () => ({ ...sureResult, score: Number.NaN }) }), [piece("s1-5")], store);
    expect(calls.saved.map((r) => [r.score, r.confidence])).toEqual([[1, "low"], [0, "low"]]);
  });

  it("the work or the stored reviews cannot be loaded: the report still builds, with the report text only", async () => {
    const reviewer = fakeReviewer({ review: () => sureResult, reportText: () => "{name} is working at a grade 4 level." });
    const broken: ReviewStore = { ...memoryStore().store, stored: async () => { throw new Error("work_reviews: connection reset"); } };
    const { model, ai } = await run(reviewer, [piece("s1-3")], broken);
    expect(model.work.map((w) => w.comment)).toEqual([null]);
    expect(model.summary).toBe("{name} is working at a grade 4 level.");
    expect(ai).toMatchObject({ reviewed: 0, error: "work_reviews: connection reset" });
    const noPieces = await aiReport({ reviewer, pieces: async () => { throw new Error("answers: timeout"); }, store: memoryStore().store, build: (workReviews, reportText) => reportModel(placement, { completedTestsInGrade: 0, workReviews, reportText }) });
    expect(noPieces.ai).toMatchObject({ pieces: 0, reviewed: 0, error: "answers: timeout" });
  });

  it("a drawing that cannot be read and no typed work: not reviewed", async () => {
    const reviewer = fakeReviewer({ review: () => sureResult });
    const store: ReviewStore = { ...memoryStore().store, image: async () => null };
    const { model, ai } = await run(reviewer, [piece("s1-3")], store);
    expect(model.work[0].comment).toBeNull();
    expect(ai).toMatchObject({ reviewed: 0, failed: 1 });
  });
});
