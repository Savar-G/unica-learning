// A fake AI client for the learner profile's AI parts (#197): no network. In development, AI_REVIEW_FAKE=sure or unsure
// (profileAiClient in src/lib/learner-profile-ai.ts, never in a production build) writes the parts from the facts in the
// request, so the admin profile page shows them without a key.
// "sure": every part passes the checks. "unsure": a likely cause has a number that is not in the facts, and a next
// challenge names a standard whose prerequisites are not secure, so the checks drop both and keep the rest.
import type { AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { BC_SKILL_MAP, REPORT_TEXT_NAME, profileAiFacts } from "@/lib/assessment";

type Facts = ReturnType<typeof profileAiFacts>;

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function answer(request: AiJsonRequest, mode: "sure" | "unsure") {
  const first = request.content[0];
  const f = JSON.parse(first?.type === "text" ? first.text : "null") as Facts;
  const { profile } = f;
  const struggles = profile.struggles.map((s) => {
    const skills = f.struggle_skills.find((x) => x.code === s.code)?.skills ?? [];
    const needed = skills.flatMap((k) => k.requires).find((r) => r.result !== "secure" && r.standard !== s.code);
    const mistake = s.misconceptions.map((id) => f.misconceptions[id]).find(Boolean);
    return {
      code: s.code,
      likely_cause: mistake
        ? `The wrong answers match a known mistake: ${REPORT_TEXT_NAME} ${lower(mistake.split(", so ")[0])}.`
        : needed
          ? `A skill this builds on may not be secure yet: ${lower(needed.text)}.`
          : "The wrong answers match no known mistake, so the cause is not clear yet.",
      how_to_help: `First this skill, in short sets with objects or pictures: ${lower(needed?.text ?? skills[0]?.text ?? s.text)}. Then practise ${s.text}.`,
    };
  });
  if (mode === "unsure" && struggles[0]) struggles[0].likely_cause += " About 97 out of 100 children make this mistake.";

  const ready = [...new Set(f.next_challenge_candidates.filter((c) => c.grade >= profile.test.grade).concat(f.next_challenge_candidates).map((c) => c.code))].slice(0, 2);
  const next = [...ready];
  if (mode === "unsure") {
    const secure = new Set(profile.strengths.map((s) => s.code));
    const notReady = BC_SKILL_MAP.standards.find((s) => s.grade > profile.test.grade && !secure.has(s.code) && !f.next_challenge_candidates.some((c) => c.code === s.code));
    if (notReady) next.push(notReady.code);
  }
  const atGrade = profile.strengths.filter((s) => s.grade === profile.test.grade).map((s) => s.code);
  const behind = profile.struggles.length > 0;
  return {
    struggles,
    next_challenge: next,
    workbook_plan: {
      review: { percent: 20, standards: profile.strengths.slice(0, 2).map((s) => s.code) },
      practise: { percent: ready.length ? (behind ? 60 : 40) : 80, standards: behind ? profile.struggles.slice(0, 3).map((s) => s.code) : atGrade.slice(-2) },
      stretch: ready.length ? { percent: behind ? 20 : 40, standards: ready } : { percent: 0, standards: [] },
    },
  };
}

export function fakeProfileAi(mode: "sure" | "unsure") {
  return fakeAiClient({ model: "fake", answer: (request) => answer(request, mode) });
}
