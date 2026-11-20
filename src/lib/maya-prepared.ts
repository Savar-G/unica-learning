// Prepared replies of Maya's text session (C2, "prepare, then commit"): the model's wait starts before the child's
// final words exist. `prepare` (src/lib/maya-text.ts) asks the model for a reply to a hypothetical child turn on a copy
// of the session; the reply waits here under a key. When the real turn comes, the session uses it only when the key of
// the real turn is equal and the commit rules hold; then it goes through the same checks as a live reply, built from
// the real turn. Prepare only moves the wait: nothing here is spoken, credited or logged.
//
// A prepared reply is single-use and belongs to one child turn. Equal keys share one model request. A reply not used
// is aborted when the turn commits or the session ends. Each request holds one spend handle (src/lib/maya-spend-seam.ts),
// settled with the provider's cost, else (#1203) first provisionally with the full output allowance, then once with the
// cost from the provider's generation stats, else an estimate from the tokens actually streamed.
import { codeStance, codeVerdicts, type Session } from "@/lib/maya";
import { confirmNote, type MayaModel, type ModelInput, type TurnBrief } from "@/lib/maya-model";
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
/** The output allowance of a prepared request (maxTokens of conversationalMayaModel). */
const PREPARE_OUTPUT_TOKENS = 1_500;
/**
 * #1203: output tokens the provider may have made past the text that reached us before the abort reached it. Maya's
 * route (Anthropic, Azure) stops generating and billing when the stream is aborted (OpenRouter streaming guide, read
 * 2026-11-20). A token is at least one character, so the streamed characters bound the streamed tokens.
 */
export const PREPARE_ABORT_MARGIN_TOKENS = 300;
/** #1203: the waits before each ask for an aborted request's stats, in ms (a 404 means not yet). Then the estimate. */
export const PREPARE_STATS_WAITS_MS = [1_000, 2_000, 4_000] as const;
/** One ask for the stats stops after this long. */
const PREPARE_STATS_ASK_MS = 2_000;

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

/**
 * The keys a real turn's prepared reply may have (980571e0 audit): its own key, and, when the real brief offers
 * "confirm" beside other acts, the key of the same brief without that offer. A request prepared for "4" has the acts
 * accept_answer and guide; the real "12 minus 8 is 4." offers confirm too (code may check what it heard), and every
 * other field is equal. A reply chosen from fewer acts is still checked against the real turn, so the extra offer
 * changes nothing it may do. The opposite never holds: a prepared brief that offered confirm serves only its own key,
 * and a turn whose only act is confirm keeps its one strict key.
 */
export function preparedKeys(session: Session, brief: TurnBrief): string[] {
  const key = preparedKey(session, brief);
  if (!brief.acts.includes("confirm") || brief.acts.every((a) => a === "confirm")) return [key];
  // The brief code builds without the offer: no confirm, and so not the one note that binds only a confirm (`confirmNote`,
  // the say rule `mustAsk`). Every other note, and a note that is not exactly that one, stays in the key.
  const owed = confirmNote(session);
  const at = owed === null ? -1 : brief.notes.indexOf(owed);
  const notes = at === -1 ? brief.notes : [...brief.notes.slice(0, at), ...brief.notes.slice(at + 1)];
  return [key, preparedKey(session, { ...brief, acts: brief.acts.filter((a) => a !== "confirm"), notes })];
}

/** Words that change nothing a math turn says: at most these may differ between an interim and the final words. */
const HARMLESS = new Set(["so", "then", "the", "a", "an", "it", "it's", "that", "that's"]);
/** Spellings of one math word. Only "is", "plus" and "minus": never a word that can also change the act. */
const SAME_WORD: Record<string, string> = { equals: "is", equal: "is", "=": "is", "+": "plus", "−": "minus", "–": "minus" };

/** A turn as the interim rule compares it: normalizeTurn, then one spelling per math word, without harmless words. */
function sameTurnWords(text: string): string {
  const spaced = text
    .replace(/(\d)\s*[−–]\s*(?=\d)/g, "$1 − ")
    .replace(/(\d) - (?=\d)/g, "$1 minus ")
    .replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(one|two|three|four|five|six|seven|eight|nine)\b/gi, "$1 $2")
    .replace(/,(?=\s|$)/g, "")
    .replace(/\.(?=\s)/g, "");
  return normalizeTurn(spaced).split(" ").map((w) => SAME_WORD[w] ?? w).filter((w) => w !== "" && !HARMLESS.has(w)).join(" ");
}

/**
 * The interim rule (980571e0 audit): the final words say what the interim said. Equal numbers in the same order, the
 * same math and act words in the same order, and nothing else but harmless words ("So 12 minus 8 is 4." and "12 minus 8
 * is 4" are equal; "8 minus 12 is 4", "12 minus 8 is 4?", "I think 12 minus 8 is 4" and "my teacher said 12 minus 8 is
 * 4" are not). Never a bag of words: order counts, and every word that is not harmless must match. It is one fence of
 * several: the key, the generation, a plain math final and the full check of the reply still hold.
 */
export function sameTurn(interim: string, final: string): boolean {
  const a = sameTurnWords(interim);
  return /\d/.test(a) && a === sameTurnWords(final);
}

/** A diagnostic handle id: one short token with no spaces (the trace holds no words). */
export const DIAGNOSTIC_ID = /^\S{1,128}$/;

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
  /** Diagnostic only: the call-local id of the spend handle that paid for this request (from `prepareHandleId`). */
  diagnosticHandleId?: string;
}

export interface PreparedReply {
  readonly key: string;
  /** The hypotheses this request serves (equal keys share it), oldest first. */
  readonly hypotheses: (PrepareHypothesis & { at: number })[];
  readonly startedAt: number;
  /** False after use, abort or the request timeout. Unavailable entries must be discarded before selection. */
  available(): boolean;
  /** The reply for the real turn: `onText` gets the text so far at once, then as it grows. Single-use. */
  use(onText: ((soFar: string) => void) | undefined, signal: AbortSignal): Promise<unknown>;
  /** The cost, once known. */
  cost(): { usd: number; estimated?: true } | null;
  /** Diagnostic only: the id the session's `prepareHandleId` gave this entry's own handle object, when it gave one. */
  readonly diagnosticHandleId?: string;
}

interface Entry extends PreparedReply {
  abort(): void;
  discard(): void;
}

/** One in-memory cache. Every sent attempt settles once, including providers that ignore abort. */
export function preparedReplies(model: MayaModel, spend: SpendSeam, clock: () => number, modelFor?: (handle: SpendHandle) => MayaModel | null, idOf?: (handle: SpendHandle) => string) {
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
      // Diagnostic only: read once, from this very handle object. A getter that throws or gives no plain token leaves the id missing.
      let diagnosticHandleId: string | undefined;
      try { const id = idOf?.(handle); if (typeof id === "string" && DIAGNOSTIC_ID.test(id)) diagnosticHandleId = id; } catch { /* honest missing id */ }
      let asked: MayaModel | null;
      try { asked = modelFor ? modelFor(handle) : model; }
      catch { spend.giveBack(handle); return false; }
      if (!asked || asked.output !== 3) { spend.giveBack(handle); return false; }
      const controller = new AbortController();
      let soFar = "";
      // Characters received, also after the abort: what the provider streamed.
      let received = 0;
      let lookup: (() => Promise<number | null>) | null = null;
      // The provider's request ended (it answered or failed), not just our timer.
      let ended = false;
      let listener: ((text: string) => void) | undefined;
      let settled: { usd: number; estimated?: true } | null = null;
      let reported: number | null = null;
      let used = false;
      let decision: boolean | null = null;
      let done = false;
      // US dollars when the provider gives no price: one token per character of input (and 8,000 for the instructions),
      // and the output tokens. The handle's reservation is in CAD micros and is never a price (#1203).
      const usdFor = (outputTokens: number) => ((JSON.stringify(brief).length + 8_000) * PREPARE_ESTIMATE_USD_PER_M.input + outputTokens * PREPARE_ESTIMATE_USD_PER_M.output) / 1_000_000;
      const upperCost = usdFor(PREPARE_OUTPUT_TOKENS);
      // The provider's real cost from its stats, a late reported cost, or null after the last wait.
      const finalCost = async (): Promise<number | null> => {
        for (const ms of PREPARE_STATS_WAITS_MS) {
          await new Promise((r) => setTimeout(r, ms));
          if (reported !== null) return reported;
          if (!lookup) return null;
          const ask = lookup;
          const usd = await Promise.race([ask().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), PREPARE_STATS_ASK_MS))]);
          if (reported !== null) return reported;
          if (typeof usd === "number" && Number.isFinite(usd) && usd >= 0) return usd;
        }
        return null;
      };
      const settle = () => {
        if (settled || decision === null || !done) return;
        const used = decision;
        if (reported !== null) {
          settled = { usd: reported };
          spend.settle(handle, reported, { used });
          return;
        }
        // No cost came back (an aborted stream sends no usage chunk). With a request that ended and no stats to ask,
        // nothing more can come: the streamed size plus a margin.
        const streamed = Math.min(upperCost, usdFor(received + PREPARE_ABORT_MARGIN_TOKENS));
        if (ended && !lookup) {
          settled = { usd: streamed, estimated: true };
          spend.settle(handle, streamed, { used });
          return;
        }
        // Else the most the provider can bill counts at once, and the final figure replaces it once: the real cost, else
        // the streamed estimate. A provider still running at our timer may produce the whole allowance: it stays.
        settled = { usd: upperCost, estimated: true };
        spend.settle(handle, upperCost, { used, provisional: true });
        void finalCost().then((usd) => {
          settled = usd !== null ? { usd } : { usd: ended ? Math.min(upperCost, usdFor(received + PREPARE_ABORT_MARGIN_TOKENS)) : upperCost, estimated: true };
          spend.settle(handle, settled.usd, { used });
        });
      };
      let end: (value: { proposal: unknown } | { error: unknown }) => void;
      const result = new Promise<{ proposal: unknown } | { error: unknown }>((resolve) => { end = resolve; });
      const finish = (got: { proposal: unknown } | { error: unknown }, provider = true) => {
        clearTimeout(timer);
        if (done) return;
        ended = provider;
        done = true;
        settle();
        end(got);
      };
      const entry: Entry = {
        key, hypotheses: [{ ...hypothesis, at: clock() }], startedAt: clock(), ...(diagnosticHandleId !== undefined ? { diagnosticHandleId } : {}),
        available: () => !used && !controller.signal.aborted,
        use(onText, signal) {
          if (used || controller.signal.aborted || signal.aborted) {
            entry.discard();
            return Promise.reject(new Error("prepared reply is unavailable"));
          }
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
      const timer = setTimeout(() => { entry.abort(); finish({ error: new Error("prepared request timed out") }, false); }, 6_000);
      open.set(key, entry);
      try {
        void Promise.resolve(asked.propose(brief as unknown as ModelInput, controller.signal,
          (text) => { received = Math.max(received, text.length); if (!controller.signal.aborted) { soFar = text; listener?.(text); } },
          (usd) => { if (Number.isFinite(usd) && usd >= 0) reported = usd; },
          (cost) => { lookup = cost; }))
          .then((proposal) => finish({ proposal }), (error: unknown) => finish({ error }));
      } catch (error) { finish({ error }); }
      return true;
    },
    takeAll(): Map<string, PreparedReply> { const taken = open; open = new Map(); return taken; },
    used(reply: PreparedReply, finalAt: number): PrepareRecord {
      return { kind: reply.hypotheses[0].reason, leadMs: Math.max(0, finalAt - reply.startedAt), status: "used", ...(reply.diagnosticHandleId !== undefined ? { diagnosticHandleId: reply.diagnosticHandleId } : {}) };
    },
    discard(reply: PreparedReply, reason: NonNullable<PrepareRecord["reason"]>, at: number): PrepareRecord {
      const entry = reply as Entry;
      if (open.get(entry.key) === entry) open.delete(entry.key);
      entry.discard();
      return { kind: entry.hypotheses[0].reason, leadMs: Math.max(0, at - entry.startedAt), status: "discarded", reason, ...(entry.diagnosticHandleId !== undefined ? { diagnosticHandleId: entry.diagnosticHandleId } : {}) };
    },
  };
}
