import { describe, expect, it } from "vitest";
import { BANKS, learnerProfile, type LearnerProfile } from "@/lib/assessment";
import { takeTest } from "@/lib/assessment/scripted-child";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { profileAiClient, writeProfileAi } from "@/lib/learner-profile-ai";

// The switch of the learner profile's AI parts (#197) and the development fake behind AI_REVIEW_FAKE, through the
// module's public interface. The report job's tests cover the build with the fake client.

const STANDARD = new Map(BANKS["3-5"].map((t) => [t.id, t.standard]));
const WEAK = new Set(["4.1", "4.3", "4.11"]);

/**
 * A grade 4 child in BC who knows grade 4, except three standards with a coded wrong answer on their questions:
 * struggles to explain, and standards ready for a challenge.
 */
function struggling(): LearnerProfile {
  const right = (q: { templateId: string; level: number }) => !WEAK.has(STANDARD.get(q.templateId)!) && q.level <= 4;
  const { asked, placement } = takeTest({ grade: 4, province: "BC" }, 101, right);
  return learnerProfile({
    placement,
    answers: asked.map((q) => {
      const right = !WEAK.has(STANDARD.get(q.templateId)!) && q.level <= 4;
      return {
        question: q, response: right ? q.answer : q.wrong[0]?.value ?? "no idea", correct: right, misconception: right ? null : q.wrong[0]?.misconception ?? null,
        timeMs: 20_000, work: { required: false, drawing: false, typed: false }, readAloud: null, away: null,
      };
    }),
    help: "no",
    learning: null,
  })!;
}

describe("the switch", () => {
  it("is off without OPENROUTER_API_KEY: no client, so no AI call can happen", () => {
    expect(profileAiClient({})).toBeNull();
    expect(profileAiClient({ OPENROUTER_API_KEY: "  " })).toBeNull();
  });

  it("is on with the key, with the model from AI_MODEL", () => {
    expect(profileAiClient({ OPENROUTER_API_KEY: "sk-or-test", AI_MODEL: "google/gemini-3-pro" })?.model).toBe("google/gemini-3-pro");
  });

  it("gives the fake for AI_REVIEW_FAKE in development only, never in a production build", () => {
    expect(profileAiClient({ NODE_ENV: "development", AI_REVIEW_FAKE: "sure" })?.model).toBe("fake");
    expect(profileAiClient({ NODE_ENV: "production", AI_REVIEW_FAKE: "sure" })).toBeNull();
  });
});

describe("the request", () => {
  it("neither sends nor asks for a words-or-numbers finding (D-121)", async () => {
    const client = fakeAiClient({ answer: () => ({}) });
    await expect(writeProfileAi(client, struggling())).rejects.toThrow();
    const [request] = client.requests;
    const sent = JSON.stringify(request).toLowerCase();
    for (const gone of ["words or numbers", "wordsornumbers", "words-or-numbers"]) expect(sent).not.toContain(gone);
  });

  it("sends no \"not tested\" label and no untested list, in the facts or the instructions (#245)", async () => {
    const profile = struggling();
    expect(profile.unknowns.untested.length).toBeGreaterThan(0);
    const client = fakeAiClient({ answer: () => ({}) });
    await expect(writeProfileAi(client, profile)).rejects.toThrow();
    const [request] = client.requests;
    expect(JSON.stringify(request)).not.toMatch(/not tested|untested|partly tested/i);
    const facts = JSON.parse(request.content[0].type === "text" ? request.content[0].text : "");
    expect(facts.profile.unknowns).not.toHaveProperty("untested");
  });
});

describe("the development fake", () => {
  it("'sure' writes every part, and every part passes the checks", async () => {
    const profile = struggling();
    expect(profile.struggles.length).toBeGreaterThan(0);
    const { ai, dropped } = await writeProfileAi(profileAiClient({ NODE_ENV: "development", AI_REVIEW_FAKE: "sure" })!, profile);
    expect(dropped).toEqual([]);
    expect(Object.keys(ai.likelyCauses!.value)).toEqual(profile.struggles.map((s) => s.code));
    expect(Object.keys(ai.howToHelp!.value)).toEqual(profile.struggles.map((s) => s.code));
    expect(ai.nextChallenge?.value.length).toBeGreaterThan(0);
    expect(ai.workbookPlan?.model).toBe("fake");
  });

  it("'unsure' writes a number that is not in the facts and a challenge that is not ready: the checks drop both", async () => {
    const { ai, dropped } = await writeProfileAi(profileAiClient({ NODE_ENV: "development", AI_REVIEW_FAKE: "unsure" })!, struggling());
    expect(dropped.map((d) => [d.part, d.problem])).toEqual([["likelyCauses", "number"], ["nextChallenge", expect.stringMatching(/prerequisite/)]]);
    expect(ai.nextChallenge?.value.length).toBeGreaterThan(0);
  });
});
