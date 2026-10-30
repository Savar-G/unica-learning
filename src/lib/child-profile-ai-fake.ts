// A fake AI client for the child's profile findings (#304): no network. In development, AI_REVIEW_FAKE=sure or unsure
// (childProfileAiClient in src/lib/child-profile-ai.ts, never in a production build) writes findings from the facts in
// the request, so the admin profile page shows them without a key.
// "sure": one finding for each standard with an event that was not right, linked to those events; every one passes the
// checks. "unsure": also a finding linked to an event id that is not in the facts, and one that is not worded as a
// hypothesis, so the checks drop both and keep the rest.
import type { AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import type { ChildProfileAiFacts } from "@/lib/child-profile-ai";

function answer(request: AiJsonRequest, mode: "sure" | "unsure") {
  const first = request.content[0];
  const facts = JSON.parse(first?.type === "text" ? first.text : "null") as ChildProfileAiFacts;
  const missed = new Map<string, ChildProfileAiFacts["events"]>();
  for (const e of facts.events) if (e.result !== "right") missed.set(e.standard, [...(missed.get(e.standard) ?? []), e]);
  const findings = [...missed].map(([standard, events]) => {
    const text = facts.standards.find((s) => s.code === standard)?.text ?? "this standard";
    const stuck = events.find((e) => e.stuck_at)?.stuck_at;
    return {
      standard,
      hypothesis: stuck
        ? `The child may get stuck at the same step on: ${text.charAt(0).toLowerCase()}${text.slice(1)}.`
        : `The child may not be sure yet of: ${text.charAt(0).toLowerCase()}${text.slice(1)}.`,
      event_ids: events.map((e) => e.id),
    };
  });
  const some = facts.events[0];
  if (mode === "unsure" && some) {
    findings.push({ standard: some.standard, hypothesis: "The child may mix up the steps here.", event_ids: [some.id, "00000000-0000-4000-8000-00000000dead"] });
    findings.push({ standard: some.standard, hypothesis: "The child cannot do this.", event_ids: [some.id] });
  }
  return { findings };
}

export function fakeChildProfileAi(mode: "sure" | "unsure") {
  return fakeAiClient({ model: "fake", answer: (request) => answer(request, mode) });
}
