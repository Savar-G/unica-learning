// A small deterministic tutor model for `--fake --tutor` and the cost estimate's dry run (D-345). It reads the tutor
// brief only: it tells the next step the child has not done, with its reason from code's brief, and asks one question.
// It is not a teacher and it checks nothing; the session checks every message it writes (checkTutorSay), so its runs show
// the plumbing and the judge's inputs, not Maya.
import type { TutorBrief } from "@/lib/maya";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import type { MayaModel, TurnBrief } from "@/lib/maya-model";

const numbersOf = (text: string) => (text.match(/\d+/g) ?? []).map(Number);

function tutorReply(brief: TutorBrief): unknown {
  const said = numbersOf(brief.childTurn ?? "");
  const answers: Record<string, unknown>[] = [];
  const steps = brief.question?.steps ?? [];
  const right = brief.question ? Number(brief.question.answer) : NaN;
  if (Number.isFinite(right) && said.includes(right)) answers.push({ value: { type: "number", value: right }, step: "result", problem: "target", verdict: "right" });
  else {
    const step = steps.find((s) => !brief.progress.done.includes(s.id) && typeof s.result === "number" && said.includes(s.result));
    if (step) answers.push({ value: { type: "number", value: step.result }, step: step.id, problem: "target", verdict: "right" });
  }
  const reading = { answers, stop: /\b(stop|bye|goodbye)\b/i.test(brief.childTurn ?? ""), help: /\b(help|stuck|don'?t get|teach me)\b/i.test(brief.childTurn ?? "") ? "more" : "none" };
  if (brief.progress.solved) {
    // The right answer stands: ask once how the child got it, then close, so a fake run can end solved.
    const asked = brief.transcript.some((t) => t.speaker === "maya" && /how did you get it/i.test(t.text));
    return asked ? reply("You did each step yourself. Thanks for working with me. Bye for now!", "close", { reading }) : reply("Yes, that is right. How did you get it?", "guide", { reading });
  }
  const next = steps.find((s) => !brief.progress.done.includes(s.id));
  const work = next?.work.replace(/[.\s]+$/, "");
  const say = next ? `Let's do it together. ${work}. Now you try: what do you get next?` : "Tell me what you are thinking. What is your next step?";
  return reply(say, "guide", { reading });
}

/** The fake tutor model. */
export function fakeTutorModel(): MayaModel {
  return conversationalFake({ id: "fake-tutor", answer: (brief: TurnBrief) => tutorReply(brief as unknown as TutorBrief) });
}
