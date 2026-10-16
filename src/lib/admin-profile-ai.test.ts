import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdminProfile } from "@/components/admin-profile";
import { REPORT_TEXT_NAME, learnerProfile, type LearnerProfile } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { fakeAiClient } from "@/lib/ai-client-fake";
import type { ProfileDetail } from "@/lib/admin-store";
import { writeProfileAi } from "@/lib/learner-profile-ai";

// The admin profile page (#196) shows the learner profile's AI parts (#197) with their labels: each part under its
// name, with the id of the model that wrote it, and the child's first name in place of "{name}". Rendered as the page
// renders it, from a stored profile.
vi.mock("server-only", () => ({}));

const MODEL = "openai/gpt-5.5-mini";

/** Asha, grade 4 in BC: knows grade 3 and gives a coded wrong answer on grade 4 questions. */
function facts(): LearnerProfile {
  const { asked, placement } = takeTest({ grade: 4, province: "BC" }, 101, knowsUpTo(3));
  return learnerProfile({
    placement,
    answers: asked.map((q) => ({
      question: q, response: q.level <= 3 ? q.answer : q.wrong[0]?.value ?? "no idea", correct: q.level <= 3,
      misconception: q.level <= 3 ? null : q.wrong[0]?.misconception ?? null, timeMs: 20_000,
      work: { required: false, drawing: false, typed: false }, readAloud: null, away: null,
    })),
    help: "no",
    learning: null,
  })!;
}

const page = (profile: LearnerProfile) => renderToStaticMarkup(createElement(AdminProfile, {
  email: "savar@unicalearning.com",
  detail: {
    test: {
      id: "11111111-1111-4111-8111-111111111111", child_id: "c", parent_id: "p", grade: 4, province: "BC", status: "completed",
      completed_at: "2026-10-16T12:00:00Z", child: { first_name: "Asha" } as ProfileDetail["test"]["child"], parent: null,
    },
    stored: { created_at: "2026-10-16T12:00:00Z", built_at: "2026-10-16T12:01:00Z", schema_version: 1, profile: JSON.parse(JSON.stringify(profile)) },
    numbers: new Map(),
  },
}));

describe("the admin profile page's AI parts", () => {
  it("shows each AI part with its label and the model id, with the child's name in the texts", async () => {
    const profile = facts();
    const [weak] = profile.struggles;
    const ai = fakeAiClient({ model: MODEL, answer: () => ({
      struggles: [{ code: weak.code, likely_cause: `${REPORT_TEXT_NAME} may count on by ones.`, how_to_help: `Ask ${REPORT_TEXT_NAME} to explain each step.` }],
      next_challenge: [],
      workbook_plan: { review: { percent: 30, standards: [] }, practise: { percent: 70, standards: [weak.code] }, stretch: { percent: 0, standards: [] } },
    }) });
    const { ai: parts } = await writeProfileAi(ai, profile);
    const html = page({ ...profile, ai: parts });

    const written = html.slice(html.indexOf("Written by AI"), html.indexOf("Stored JSON"));
    for (const label of ["Likely cause of each struggle", "How to help with each struggle", "Workbook 1 plan"]) expect(written).toContain(label);
    // No next challenge was kept, so that part is not shown.
    expect(written).not.toContain("Next challenge");
    expect(written.match(new RegExp(`AI: ${MODEL}`, "g"))).toHaveLength(3);
    expect(written).toContain("Asha may count on by ones.");
    expect(written).toContain("Ask Asha to explain each step.");
    expect(written).not.toContain(REPORT_TEXT_NAME);
  });

  it("says that no part was written by AI when the profile has the facts only", () => {
    const written = page(facts()).split("Written by AI")[1];
    expect(written).toContain("No part of this profile was written by AI");
    expect(written).not.toContain("AI: ");
  });
});
