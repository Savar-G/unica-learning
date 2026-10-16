// Scripted children for the tests: they take a whole test through the public session API.
import { createSession, finish, nextQuestion, submitAnswer, type ChildProfile, type Question, type Template } from "@/lib/assessment";

export type Script = (q: Question, index: number) => boolean;

/** How long the child takes on each question, in milliseconds. */
export type Timing = (q: Question, index: number) => number;

// A scripted child: decides right or wrong for each question, answers in 20 seconds unless `timeFor` says otherwise.
export function takeTest(profile: ChildProfile, seed: number, isRight: Script, bank?: readonly Template[], timeFor: Timing = () => 20_000) {
  let session = createSession(profile, seed, { bank });
  const asked: Question[] = [];
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    const response = isRight(q, asked.length) ? q.answer : "no idea";
    asked.push(q);
    session = submitAnswer(session, { questionId: q.id, response, timeMs: timeFor(q, asked.length - 1) });
  }
  return { asked, placement: finish(session) };
}

export const allRight: Script = () => true;
export const allWrong: Script = () => false;
/** Knows everything up to this level and nothing above it. */
export const knowsUpTo = (level: number): Script => (q) => q.level <= level;
/** Gets the first `n` questions right, the rest wrong. */
export const firstRight = (n: number): Script => (_, i) => i < n;
