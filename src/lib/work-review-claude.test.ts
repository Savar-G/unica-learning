import { afterEach, describe, expect, it, vi } from "vitest";
import { reportModel } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { claudeReviewer } from "@/lib/work-review-claude";
import type { ReviewInput } from "@/lib/work-review";

// The real reviewer with fetch mocked: no network. Checks what goes to the Anthropic API and what comes back.

afterEach(() => vi.unstubAllEnvs());

interface Sent {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown> & { messages: { role: string; content: unknown }[] };
}

/** A fetch that records each request and answers with the given Messages API replies, one per call. */
function mockFetch(...replies: { status?: number; body: unknown }[]) {
  const sent: Sent[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    sent.push({ url, method: init?.method ?? "GET", headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    const reply = replies[Math.min(sent.length - 1, replies.length - 1)];
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json", "request-id": "req_test" } });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, sent };
}

const message = (json: unknown, stop_reason = "end_turn") => ({
  body: {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text: JSON.stringify(json) }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 80 },
  },
});

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

describe("the Claude work reviewer (#68), fetch mocked", () => {
  it("sends one request to the Messages API with the API key, the model, structured output and the drawing", async () => {
    const { fetch, sent } = mockFetch(message(reviewJson));
    const result = await claudeReviewer({ apiKey: "sk-ant-test", model: "claude-sonnet-5-5", fetch }).review(input(), signal());

    expect(result).toEqual({ errorType: "regrouping in addition", kind: "misunderstanding", comment: "Added each column but did not carry the 1.", score: 0.88 });
    expect(sent).toHaveLength(1);
    const [req] = sent;
    expect(req.url).toBe("https://api.anthropic.com/v1/messages");
    expect(req.method).toBe("POST");
    expect(req.headers.get("x-api-key")).toBe("sk-ant-test");
    expect(req.headers.get("anthropic-version")).toBeTruthy();
    expect(req.headers.get("authorization")).toBeNull();
    expect(req.body).toMatchObject({
      model: "claude-sonnet-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium", format: { type: "json_schema", schema: { required: ["error_type", "kind", "comment", "confidence"] } } },
    });
    expect(req.body).not.toHaveProperty("thinking");
    expect(req.body).not.toHaveProperty("temperature");
    const [user] = req.body.messages;
    expect(user.role).toBe("user");
    const [image, text] = user.content as [{ type: string; source: Record<string, string> }, { type: string; text: string }];
    expect(image).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: Buffer.from(PNG).toString("base64") } });
    expect(text.type).toBe("text");
    for (const fact of ["Question: 47 + 38 = ?", "Question level: grade 4", "Right answer: 85", "Child's answer: 715", "Mark: wrong", "Forgets to carry when adding"]) {
      expect(text.text).toContain(fact);
    }
  });

  it("without a drawing, sends the typed working as text only, marked as the child's work", async () => {
    const { fetch, sent } = mockFetch(message(reviewJson));
    await claudeReviewer({ apiKey: "sk-ant-test", model: "claude-sonnet-5-5", fetch }).review(input({ png: null, misconception: null, text: "47+38\n= 715" }), signal());
    const content = sent[0].body.messages[0].content as { type: string; text: string }[];
    expect(content.map((c) => c.type)).toEqual(["text"]);
    expect(content[0].text).toContain("<typed_working>\n47+38\n= 715\n</typed_working>");
    expect(content[0].text).toContain("Drawing: none");
    expect(content[0].text).not.toContain("known mistake");
  });

  it("never sends a bearer token, even when ANTHROPIC_AUTH_TOKEN is set: the API key is the only credential", async () => {
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "a-subscription-token");
    const { fetch, sent } = mockFetch(message(reviewJson));
    await claudeReviewer({ apiKey: "sk-ant-test", model: "claude-sonnet-5-5", fetch }).review(input(), signal());
    expect(sent[0].headers.get("authorization")).toBeNull();
    expect(sent[0].headers.get("x-api-key")).toBe("sk-ant-test");
  });

  it("a refusal or a cut-off answer is an error, never a review", async () => {
    for (const stop of ["refusal", "max_tokens"]) {
      const { fetch } = mockFetch(message(reviewJson, stop));
      await expect(claudeReviewer({ apiKey: "sk-ant-test", model: "claude-sonnet-5-5", fetch }).review(input(), signal()), stop).rejects.toThrow();
    }
  });

  it("an API error is an error, after the one retry", async () => {
    const { fetch, sent } = mockFetch({ status: 500, body: { type: "error", error: { type: "api_error", message: "Internal error" } } });
    await expect(claudeReviewer({ apiKey: "sk-ant-test", model: "claude-sonnet-5-5", fetch, maxRetries: 0 }).review(input(), signal())).rejects.toThrow();
    expect(sent).toHaveLength(1);
  });

  it("writes the report text from the model's facts, with {name} for the child, and returns it", async () => {
    const model = reportModel(takeTest({ grade: 4, province: "BC" }, 1, knowsUpTo(4)).placement, { completedTestsInGrade: 0, workReviews: [] });
    const { fetch, sent } = mockFetch(message({ text: "{name} is working at a grade 4 level." }));
    const text = await claudeReviewer({ apiKey: "sk-ant-test", model: "claude-sonnet-5-5", fetch }).reportText(model, signal());

    expect(text).toBe("{name} is working at a grade 4 level.");
    const [req] = sent;
    expect(req.body).toMatchObject({ model: "claude-sonnet-5-5", output_config: { effort: "low", format: { type: "json_schema" } } });
    const facts = JSON.parse(req.body.messages[0].content as string);
    expect(facts).toMatchObject({ child: "{name}", school_grade: "grade 4", working_level: "grade 4", working_level_against_school_grade: "the same", help_warning: false });
    expect(facts.areas).toEqual(model.strands.map((s) => expect.objectContaining({ area: s.name, right: s.correct, questions: s.total })));
    expect(String(req.body.system)).toContain("{name}");
  });
});
