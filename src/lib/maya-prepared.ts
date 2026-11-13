// Prepared replies of Maya's text session (C2, "prepare, then commit"): the model's wait starts before the child's
// final words exist. `prepare` (src/lib/maya-text.ts) asks the model for a reply to a hypothetical child turn on a copy
// of the session; the reply waits here under a key. When the real turn comes, the session uses it only when the key of
// the real turn is equal and the commit rules hold; then it goes through the same checks as a live reply, built from
// the real turn. Prepare only moves the wait: nothing here is spoken, credited or logged.
//
// A prepared reply is single-use and belongs to one child turn. Equal keys share one model request. A reply not used
// is aborted when the turn commits or the session ends. Each request holds one spend handle (src/lib/maya-spend-seam.ts),
// settled exactly once: with the provider's cost, else an estimate from the text sizes.
import { codeStance, codeVerdicts, type Session } from "@/lib/maya";
import type { MayaModel, ModelInput, TurnBrief } from "@/lib/maya-model";
import type { SpendHandle, SpendSeam } from "@/lib/maya-spend-seam";

/** A child turn that may come: the newest interim transcript, or a value the session expects. */
export interface PrepareHypothesis {
  text: string;
  reason: "interim" | "expected";
}

/** At most this many model requests are prepared for one child turn. */
export const MAX_PREPARES_PER_TURN = 3;

/**
 * The estimate of a request's cost when the provider reported none (an aborted stream): US dollars per million tokens,
 * using the full output allowance when no cost returns. Claude Sonnet 5.5 through OpenRouter, measured 2026-11-13 (3,120 tokens in and 286 out
 * cost USD 0.0091). The trace marks such a cost `estimated`.
 */
export const PREPARE_ESTIMATE_USD_PER_M = { input: 2, output: 10 } as const;

const UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
/** Sounds that carry no meaning. Never "no", "not", "wait" or "maybe": they change what the child said. */
const FILLER = new Set(["um", "umm", "uh", "uhh", "er", "erm", "hmm", "hm", "mm", "ah"]);

/**
 * A child turn for the interim rule: lower case, punctuation and filler sounds removed, number words as digits
 * ("twelve minus eight is four" and "12 minus 8 is 4." are equal; "four" and "four no six" are not).
 */
export function normalizeTurn(text: string): string {
  const words = text.toLowerCase().replace(/[’]/g, "'").replace(/(\d),(?=\d{3}\b)/g, "$1").trim().replace(/[.!]+$/g, "").split(/\s+/).filter((w) => w !== "" && !FILLER.has(w));
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const unit = UNITS.indexOf(w);
    const ten = TENS.indexOf(w);
    if (ten >= 2) {
      const next = UNITS.indexOf(words[i + 1] ?? "");
      if (next >= 1 && next <= 9) { out.push(String(ten * 10 + next)); i++; } else out.push(String(ten * 10));
    } else if (unit >= 0) out.push(String(unit));
    else out.push(w);
  }
  return out.join(" ");
}

/**
 * The key of a turn: code's own read of it, never its raw words. It holds everything of the brief but the child's words:
 * the state and the step states, the help step and level, the transcript before the turn, the acts, the board offers,
 * the notes, the allowed and secret numbers, the facts with each heard answer and its verdict, and code's stance. Two
 * turns with equal keys get the same brief apart from the child's own words.
 */
export function preparedKey(session: Session, brief: TurnBrief): string {
  const transcript = brief.childTurn !== null && brief.transcript.at(-1)?.speaker === "child" ? brief.transcript.slice(0, -1) : brief.transcript;
  return JSON.stringify({ ...brief, childTurn: null, transcript,
    turns: session.turns.length, verdicts: codeVerdicts(session), stance: codeStance(session),
  });
}

/** What became of one prepared request, for the trace. */
export interface PrepareRecord {
  kind: PrepareHypothesis["reason"];
  /** From the start of the prepared request to the child's final words (or to the discard, with no final words). */
  leadMs: number;
  status: "used" | "discarded";
  /** Why it was not used: another key, the texts differ, not a plain math turn, the session moved on or ended. */
  reason?: "key" | "text" | "not_plain" | "stale" | "ended";
  /** The cost in US dollars; `estimated` when the provider reported none. */
  usd?: number;
  estimated?: true;
}

export interface PreparedReply {
  readonly key: string;
  /** The hypotheses this request serves (equal keys share it), oldest first. */
  readonly hypotheses: (PrepareHypothesis & { at: number })[];
  readonly startedAt: number;
  /** The reply for the real turn: `onText` gets the text so far at once, then as it grows. Single-use. */
  use(onText: ((soFar: string) => void) | undefined, signal: AbortSignal): Promise<unknown>;
  /** The cost, once known. */
  cost(): { usd: number; estimated?: true } | null;
}

interface Entry extends PreparedReply {
  abort(): void;
  discard(): void;
}

/** One in-memory cache. Every sent attempt settles once, including providers that ignore abort. */
export function preparedReplies(model: MayaModel, spend: SpendSeam, clock: () => number) {
  let open = new Map<string, Entry>();
  return {
    get: (key: string): PreparedReply | undefined => open.get(key),
    share(key: string, hypothesis: PrepareHypothesis) {
      const entry = open.get(key);
      if (!entry) return;
      const old = entry.hypotheses.findIndex((h) => h.reason === hypothesis.reason);
      if (old >= 0) entry.hypotheses[old] = { ...hypothesis, at: clock() };
      else entry.hypotheses.push({ ...hypothesis, at: clock() });
    },
    start(key: string, brief: TurnBrief, hypothesis: PrepareHypothesis, handle: SpendHandle): boolean {
      const controller = new AbortController();
      let soFar = "";
      let listener: ((text: string) => void) | undefined;
      let settled: { usd: number; estimated?: true } | null = null;
      let reported: number | null = null;
      let used = false;
      let decision: boolean | null = null;
      let done = false;
      // Upper bound when the provider gives no price: one token per character of input, plus the full 1,500-token
      // output allowance. Abort does not prove that the provider stopped generating.
      const upperCost = Math.max(handle.micros / 1_000_000, ((JSON.stringify(brief).length + 8_000) * PREPARE_ESTIMATE_USD_PER_M.input + 1_500 * PREPARE_ESTIMATE_USD_PER_M.output) / 1_000_000);
      const settle = () => {
        if (settled || decision === null || !done) return;
        settled = reported !== null ? { usd: reported } : { usd: upperCost, estimated: true };
        spend.settle(handle, settled.usd, { used: decision });
      };
      let end: (value: { proposal: unknown } | { error: unknown }) => void;
      const result = new Promise<{ proposal: unknown } | { error: unknown }>((resolve) => { end = resolve; });
      const finish = (got: { proposal: unknown } | { error: unknown }) => {
        clearTimeout(timer);
        done = true;
        settle();
        end(got);
      };
      const entry: Entry = {
        key, hypotheses: [{ ...hypothesis, at: clock() }], startedAt: clock(),
        use(onText, signal) {
          if (used || controller.signal.aborted || signal.aborted) return Promise.reject(new Error("prepared reply is unavailable"));
          used = true;
          decision = true;
          settle();
          const abort = () => { listener = undefined; controller.abort(); };
          signal.addEventListener("abort", abort, { once: true });
          listener = onText;
          if (soFar) listener?.(soFar);
          return result.then((got) => { if ("proposal" in got) return got.proposal; throw got.error; }).finally(() => { listener = undefined; signal.removeEventListener("abort", abort); });
        },
        cost: () => settled,
        discard() { decision ??= false; entry.abort(); settle(); },
        abort() {
          listener = undefined;
          controller.abort();
          // Give an abort-ignoring provider time to report the actual bill. The bounded timer settles the full
          // allowance if it never returns. No late callback can reach the child.
        },
      };
      const timer = setTimeout(() => { entry.abort(); finish({ error: new Error("prepared request timed out") }); }, 6_000);
      open.set(key, entry);
      try {
        void Promise.resolve(model.propose(brief as unknown as ModelInput, controller.signal,
          (text) => { if (!controller.signal.aborted) { soFar = text; listener?.(text); } },
          (usd) => { if (Number.isFinite(usd) && usd >= 0) reported = usd; }))
          .then((proposal) => finish({ proposal }), (error: unknown) => finish({ error }));
      } catch (error) { finish({ error }); }
      return true;
    },
    takeAll(): Map<string, PreparedReply> { const taken = open; open = new Map(); return taken; },
    used(reply: PreparedReply, finalAt: number): PrepareRecord {
      return { kind: reply.hypotheses[0].reason, leadMs: Math.max(0, finalAt - reply.startedAt), status: "used" };
    },
    discard(reply: PreparedReply, reason: NonNullable<PrepareRecord["reason"]>, at: number): PrepareRecord {
      const entry = reply as Entry;
      if (open.get(entry.key) === entry) open.delete(entry.key);
      entry.discard();
      return { kind: entry.hypotheses[0].reason, leadMs: Math.max(0, at - entry.startedAt), status: "discarded", reason };
    },
  };
}
