import { describe, expect, it } from "vitest";
import { reportModel } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { aiWorkReviewer } from "@/lib/work-review-ai";
import type { ReviewInput } from "@/lib/work-review";

// The work reviewer on the AI client (#68, #183), with the fake client: what the model reads and what comes back.

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);
const input = (extra: Partial<ReviewInput> = {}): ReviewInput => ({
  prompt: "47 + 38 = ?",
  answer: "715",
  rightAnswer: "85",
  correct: false,
  level: 4,
  misconception: "Forgets to carry when adding",
  text: null,
  png: PNG,
  ...extra,
});
const signal = () => new AbortController().signal;
const reviewJson = { error_type: "regrouping in addition", kind: "misunderstanding", comment: "Added each column but did not carry the 1.", confidence: 0.88 };

describe("the AI work reviewer (#68, #183)", () => {
  it("asks for a work review with the facts as text, then the drawing, and returns the review", async () => {
    const client = fakeAiClient({ model: "anthropic/claude-sonnet-5.5", answer: () => reviewJson });
    const reviewer = aiWorkReviewer(client);
    const result = await reviewer.review(input(), signal());

    expect(reviewer.model).toBe("anthropic/claude-sonnet-5.5");
    expect(result).toEqual({ errorType: "regrouping in addition", kind: "misunderstanding", comment: "Added each column but did not carry the 1.", score: 0.88 });
    expect(client.requests).toHaveLength(1);
    const [req] = client.requests;
    expect(req).toMatchObject({ name: "work_review", effort: "medium", schema: { required: ["error_type", "kind", "comment", "confidence"], additionalProperties: false } });
    expect(req.system).toContain("The mark is final");
    const [text, image] = req.content;
    expect(image).toEqual({ type: "image", mediaType: "image/png", data: PNG });
    expect(text.type).toBe("text");
    const facts = text.type === "text" ? text.text : "";
    for (const fact of ["Question: 47 + 38 = ?", "Question level: grade 4", "Right answer: 85", "Child's answer: 715", "Mark: wrong", "Forgets to carry when adding"]) {
      expect(facts).toContain(fact);
    }
  });

  it("without a drawing, sends the typed working as text only, marked as the child's work", async () => {
    const client = fakeAiClient({ answer: () => reviewJson });
    await aiWorkReviewer(client).review(input({ png: null, misconception: null, text: "47+38\n= 715" }), signal());
    const content = client.requests[0].content;
    expect(content.map((c) => c.type)).toEqual(["text"]);
    const text = content[0].type === "text" ? content[0].text : "";
    expect(text).toContain("<typed_working>\n47+38\n= 715\n</typed_working>");
    expect(text).toContain("Drawing: none");
    expect(text).not.toContain("known mistake");
  });

  it("output that does not match the review's shape is an error, never a review", async () => {
    for (const bad of [null, "text", {}, { ...reviewJson, kind: "guess" }, { ...reviewJson, confidence: "0.9" }, { ...reviewJson, comment: 5 }, { ...reviewJson, error_type: undefined }]) {
      await expect(aiWorkReviewer(fakeAiClient({ answer: () => bad })).review(input(), signal()), JSON.stringify(bad)).rejects.toThrow();
    }
  });

  it("writes the report text from the model's facts, with {name} for the child, and returns it", async () => {
    const model = reportModel(takeTest({ grade: 4, province: "BC" }, 1, knowsUpTo(4)).placement, { completedTestsInGrade: 0, workReviews: [] });
    const client = fakeAiClient({ answer: () => ({ text: "{name} is working at a grade 4 level." }) });
    const text = await aiWorkReviewer(client).reportText(model, signal());

    expect(text).toBe("{name} is working at a grade 4 level.");
    const [req] = client.requests;
    expect(req).toMatchObject({ name: "report_text", effort: "low", schema: { required: ["text"] } });
    expect(req.system).toContain("{name}");
    expect(req.content.map((c) => c.type)).toEqual(["text"]);
    const facts = JSON.parse(req.content[0].type === "text" ? req.content[0].text : "");
    expect(facts).toMatchObject({ child: "{name}", school_grade: "grade 4", working_level: "grade 4", working_level_against_school_grade: "the same", help_warning: false });
    expect(facts.areas).toEqual(model.strands.map((s) => expect.objectContaining({ area: s.name, right: s.correct, questions: s.total })));
  });

  it("sends no \"not tested\" label for the report text, in the facts or the instructions (#245)", async () => {
    const model = reportModel(takeTest({ grade: 5, province: "BC" }, 1, knowsUpTo(4)).placement, { completedTestsInGrade: 0, workReviews: [] });
    const client = fakeAiClient({ answer: () => ({ text: "{name} is working at a grade 4 level." }) });
    await aiWorkReviewer(client).reportText(model, signal());
    expect(JSON.stringify(client.requests[0])).not.toMatch(/not tested|untested|partly tested/i);
  });

  it("report text output without a text string is an error", async () => {
    const model = reportModel(takeTest({ grade: 4, province: "BC" }, 1, knowsUpTo(4)).placement, { completedTestsInGrade: 0, workReviews: [] });
    for (const bad of [null, {}, { text: 4 }]) {
      await expect(aiWorkReviewer(fakeAiClient({ answer: () => bad })).reportText(model, signal())).rejects.toThrow();
    }
  });
});
