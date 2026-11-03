// A fake AI client for the workbook generator (#312): no network. In development (never in a production build),
// WORKBOOK_AI_FAKE=on fills every slot with a sound whole-number addition, so "Prepare next workbook" makes a draft
// without an OpenRouter key; WORKBOOK_AI_FAKE=slow waits 1.5 s a page, to watch the progress. Its solve check
// (workbookFakeSolver) answers from the key and reads a few questions another way.
import type { AiItem } from "@/lib/workbook-generator-items";
import type { AiClient, AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import type { SolveRequest, Solver } from "@/lib/workbook-solve-check";

const num = (value: number) => ({
  type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null,
});
const op = (kind: "add" | "subtract", a: number, b: number) => ({ kind, operands: [num(a), num(b)], expression: null, unit: null, denominator: null, values: [] });

interface Planned {
  numbers?: number[]; name?: string; say?: string;
  operation?: { kind: "add" | "subtract" | "missing-addend"; operands: [number, number] }; figure?: string | null; figureShows?: string | null;
}
interface AskedSlot {
  contract?: { item: AiItem };
  slot: string; place?: string; skills: string[]; formats?: string[] | null; mistakes?: { name: string }[]; numbers?: Record<string, { max: number }>;
  aim?: { skill: string; kind: string }; planned?: Planned; room?: { characters: number };
}

const NAMES = ["Ava", "Ben", "Cal", "Dot", "Eli", "Fay", "Gus", "Hal", "Ivy", "Jo", "Kai", "Liv", "Max", "Ned", "Oli", "Pia", "Quin", "Rex", "Tia", "Uma"];
const hash = (t: string) => [...t].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
/** A made-up lowercase word ("qab"), so each fake question has a shape of its own, as the real AI's must (#380). */
const word = (n: number) => `q${(n % 17576).toString(26).split("").map((d) => String.fromCharCode(97 + parseInt(d, 26))).join("")}`;

/**
 * Sound items for every slot and worked example a page request asks, in the format its place takes (#380's dry-run fake,
 * scripts/workbook-samples.ts): the slot's planned numbers and wording when code planned them, else numbers within the
 * slot's range, a name and a made-up word of its own, a bare sum where a story would pass the slot's room. Every answer
 * depends only on what is asked (never on the order of calls), so a draft is the same at any concurrency; a redo (with
 * its note) answers otherwise than the first call.
 */
export function fakeWorkbookItems(r: AiJsonRequest) {
  const text = (r.content[0] as { text: string }).text;
  const asked = JSON.parse(text) as { day?: number; page?: number; slots: AskedSlot[]; examples?: AskedSlot[]; note?: string | null; currentQuestions?: {data: AiItem | null}[] };
  const day = asked.day ?? 1;
  // No two questions of a page work one sum, as the real AI is asked (#380): a pair taken moves on.
  const sums = new Set<string>();
  return {
    items: [...asked.slots, ...(asked.examples ?? [])].map((s, k) => {
      if (s.contract) return s.contract.item;
      const current = asked.currentQuestions?.find(q => q.data?.slot === s.slot)?.data;
      if (current) return { ...current, ...(/apples/i.test(asked.note ?? "") ? { name: "Mia", thing: "apples" } : {}) };
      const seed = hash(`${r.name}|${day}|${asked.page ?? 0}|${s.slot}|${asked.note ?? ""}`);
      const format = s.formats?.[0] ?? "write-number";
      const base = { slot: s.slot, skill: s.skills[0], difficulty: 2, format, numbers: [], places: null, direction: null, sequence: null, pattern: null, figure: null, figureShows: null, relation: null };
      if (format === "spot-the-error" && s.mistakes?.length) {
        // A sum of its own (the first number the larger, Sam counts one too many); when that mistake is not one of the
        // level's, code shows one the sum allows (samFix). The slot's skill with the widest range, so the sum fits it.
        const skill = [...s.skills].sort((p, q) => (s.numbers?.[q]?.max ?? 0) - (s.numbers?.[p]?.max ?? 0))[0];
        const top = Math.min(99, s.numbers?.[skill]?.max ?? 99);
        const sums = Array.from({ length: Math.min(top, 30) }, (_, x) => Array.from({ length: Math.min(top, 12) }, (_, y) => [x + 2, y + 2] as const)).flat()
          .filter(([x, y]) => x >= y && x + y + 1 <= top);
        const [a, b] = sums[seed % sums.length];
        return {
          ...base, skill, text: `${a} + ${b} = ?`, operation: op("add", a, b),
          wrongAnswers: [{ value: num(a + b + 1), cause: "counted-one-extra", description: "Counts one too many", step: null }],
          easier: { text: "1 + 1 = ?", operation: op("add", 1, 1) }, shownWrong: 0,
        };
      }
      const max = Math.min(99, s.numbers?.[s.skills[0]]?.max ?? 99);
      const who = `${s.planned?.name ?? NAMES[seed % NAMES.length]} ${word(seed)}`;
      const reason = format === "written-reason";
      if (reason) return { ...base, text: `How do you know, ${who}?`, operation: null, wrongAnswers: [], easier: null, shownWrong: null };
      // The slot's planned wording with its operation and picture (#380 round 6), word for word, as the real AI is asked.
      const plan = s.planned;
      if (plan?.say && plan.operation && (format === "write-number" || format === "show-work")) {
        const [x, y] = plan.operation.operands;
        const right = plan.operation.kind === "add" ? x + y : plan.operation.kind === "subtract" ? x - y : y - x;
        return {
          ...base, skill: s.aim?.skill ?? base.skill, text: plan.say, operation: { ...op("add", x, y), kind: plan.operation.kind },
          figure: plan.figure ?? null, figureShows: plan.figureShows ?? null,
          wrongAnswers: [{ value: num(x === right ? y : x), cause: "careless", description: "Writes a number from the question", step: null }],
          easier: null, shownWrong: null,
        };
      }
      if (plan?.say && s.aim?.kind === "sequence") {
        const start = 1 + (seed % 4);
        return { ...base, skill: s.aim.skill, format: "sequence", text: plan.say, sequence: { start: num(start), step: num(1), terms: 5, blanks: [1, 3] }, operation: null, wrongAnswers: [], easier: null, shownWrong: null };
      }
      // a + b within the range of the item's skill (a + b + 1 at most its max), the slot's planned numbers when code
      // planned some (#380 round 5), else a pair of its own: on one page each slot's two numbers both differ from the
      // others' (the k-th slot), and a bare sum takes another form after every `span` slots and in each later call.
      const planned = plan?.numbers && plan.numbers[0] >= 1 && plan.numbers[0] + plan.numbers[1] + 1 <= max ? plan.numbers : null;
      const span = Math.max(1, max > 40 ? 19 : Math.min(9, max - 3));
      let b = planned?.[1] ?? 1 + ((seed + k) % span);
      const a = planned?.[0] ?? 1 + ((Math.floor(seed / 9) + 7 * k) % Math.max(1, max - span - 1));
      for (let n = 0; n < span && sums.has(`${a},${b}`) && a + b + 2 <= max; n++) b = b % span + 1;
      sums.add(`${a},${b}`);
      // The kind code aimed the slot at, as the real AI is asked (#480 review: three contexts or formats a page): a
      // missing part, a bare fact, else a story in one of several sentences.
      const call = r.name === "workbook_page_redo" ? 1 : r.name === "workbook_page_shorter" ? 2 : 0;
      const stories = [`${who} picks ${a}. Then ${b} more. How many now?`, `${who} counts ${a}, then ${b} more. How many is that?`,
        `${who} stacks ${a}. Then ${b} more go on top. How many now?`, `${who} collects ${a} and then ${b} more. How many now?`];
      const story = stories[(k + (asked.page ?? 0) + call) % stories.length];
      if (s.aim?.kind === "missing-part" && b >= 2 && a + b <= 20 && format === "write-number") {
        return {
          ...base, text: `${a} + ? = ${a + b}`, operation: { ...op("add", a, a + b), kind: "missing-addend" },
          wrongAnswers: [{ value: num(a + b), cause: "careless", description: "Writes the total.", step: null }],
          easier: b >= 2 ? { text: `${a} + ? = ${a + b - 1}`, operation: { ...op("add", a, a + b - 1), kind: "missing-addend" } } : null, shownWrong: null,
        };
      }
      const bare = s.aim?.kind === "fact" || story.length > (s.room?.characters ?? Infinity);
      // A redo or a shorter rewrite writes its bare sums in a form of its own, so they never read like the first call's.
      const form = (call + Math.floor(k / span)) % 3;
      return {
        ...base, text: bare ? [`${a} + ${b} = ?`, `? = ${a} + ${b}`, `${a} + ${b} =`][form] : story, operation: op("add", a, b),
        wrongAnswers: [{ value: num(a + b + 1), cause: "careless", description: "Counts 1 too many.", step: null }],
        easier: { text: "Try a smaller sum.", operation: op("add", 0, Math.min(a, b)) }, shownWrong: null,
      };
    }),
  };
}

/** The fake, or null when WORKBOOK_AI_FAKE is not on (or in production). */
export function workbookFakeAi(env: Record<string, string | undefined> = process.env): AiClient | null {
  const mode = env.WORKBOOK_AI_FAKE;
  if (env.NODE_ENV === "production" || (mode !== "on" && mode !== "slow")) return null;
  return fakeAiClient({
    model: "fake",
    answer: async (r) => {
      if (mode === "slow") await new Promise((done) => setTimeout(done, 1500));
      return fakeWorkbookItems(r);
    },
  });
}

/** The printed answers of a check, one per box, from the key; `wrong`: the first box answered one more than its key. */
const fromKey = (request: SolveRequest, wrong: boolean) => ({
  answers: request.key.map((k, i) => {
    const n = Number(k.right[0]);
    return { question: k.question, box: k.box, answer: wrong && i === 0 && Number.isFinite(n) ? String(n + 1) : k.right[0] };
  }),
  problem: null,
});

/**
 * The fake solve check (#312 round 3), on when the fake AI is: it answers from the key, so it costs nothing, but reads
 * about 1 question in 12 another way (the first box one more), always the same ones, so the admin screens show
 * questions that failed the solve check. Null when WORKBOOK_AI_FAKE is not on (or in production).
 */
export function workbookFakeSolver(env: Record<string, string | undefined> = process.env): Solver | null {
  if (!workbookFakeAi(env)) return null;
  const hash = (t: string) => [...t].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return {
    model: "fake",
    solve: async (request) => fromKey(request, hash(request.questions.map((q) => q.text).join("|")) % 12 === 0),
  };
}
