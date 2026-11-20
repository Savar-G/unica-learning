// Prepared replies of Maya's text session (C2, "prepare, then commit"): the model's wait starts before the child's
// final words exist. `prepare` (src/lib/maya-text.ts) asks the model for a reply to a hypothetical child turn on a copy
// of the session; the reply waits here under a key. When the real turn comes, the session uses it only when the key of
// the real turn is equal and the commit rules hold; then it goes through the same checks as a live reply, built from
// the real turn. Prepare only moves the wait: nothing here is spoken, credited or logged.
//
// A prepared reply is single-use and belongs to one child turn. Equal keys share one model request. A reply not used
// is aborted when the turn commits or the session ends. Each request holds one spend handle (src/lib/maya-spend-seam.ts),
// settled once with the provider's cost: the one it reports, else (#1203) the one its generation stats give. Until then
// the handle holds its reservation; with no receipt, the cost stays unknown and the reservation stays counted.
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
 * #1203: the waits before each ask for an aborted request's receipt (OpenRouter's generation stats; a 404 means not yet),
 * in ms: asks at about 1, 3, 7, 15 and 27 s. Live probe, 2026-11-20 (8 aborted Sonnet 5.5 streams on Maya's route, all
 * Azure): the stats appeared after 1 to 7.5 s, and once only after 12 to 20 s. After the last ask the cost is unknown and
 * the reservation stays counted. No estimate frees room: no bound on what the provider bills (model, route, reasoning
 * tokens) is verified here. The call's end waits for these asks (BLOCK_DRAIN_MS, src/lib/maya-spend-block.ts).
 */
export const PREPARE_STATS_WAITS_MS = [1_000, 2_000, 4_000, 8_000, 12_000] as const;
/** One ask for the receipt stops after this long. */
export const PREPARE_STATS_ASK_MS = 2_000;

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
  /** The cost in US dollars, the provider's own figure. None when it gave none (#1203): the reservation stays counted. */
  usd?: number;
  /** Before #1203 only: a cost estimated from text sizes. */
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
  /** The provider's cost once settled with it; null before, or when it gave none (the reservation stays counted). */
  cost(): { usd: number } | null;
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
      let lookup: (() => Promise<number | null>) | null = null;
      // The provider's request ended (it answered or failed). Apart from `done`: our timer can end the reply first.
      let providerEnded = false;
      let listener: ((text: string) => void) | undefined;
      let settled: { usd: number } | null = null;
      let settling = false;
      let reported: number | null = null;
      let used = false;
      let decision: boolean | null = null;
      let done = false;
      // The provider's receipt: a late reported cost, or the generation stats' cost; null when none came by the last
      // ask, or at once when the provider ended with no cost and offered no stats (nothing more can come).
      const receipt = async (): Promise<number | null> => {
        for (const ms of PREPARE_STATS_WAITS_MS) {
          if (reported !== null) return reported;
          if (providerEnded && !lookup) return null;
          await new Promise((r) => setTimeout(r, ms));
          if (reported !== null) return reported;
          // A provider still running may report its cost when it ends.
          if (!lookup) continue;
          const ask = lookup;
          const usd = await Promise.race([ask().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), PREPARE_STATS_ASK_MS))]);
          if (reported !== null) return reported;
          if (typeof usd === "number" && Number.isFinite(usd) && usd >= 0) return usd;
        }
        return reported;
      };
      const settle = () => {
        if (settling || decision === null || !done) return;
        settling = true;
        const used = decision;
        const pay = (usd: number | null) => {
          settled = usd === null ? null : { usd };
          spend.settle(handle, usd, { used });
        };
        if (reported !== null) { pay(reported); return; }
        // No cost came back (an aborted stream sends no usage chunk). The handle keeps its reservation until the receipt.
        void receipt().then(pay);
      };
      let end: (value: { proposal: unknown } | { error: unknown }) => void;
      const result = new Promise<{ proposal: unknown } | { error: unknown }>((resolve) => { end = resolve; });
      const finish = (got: { proposal: unknown } | { error: unknown }) => {
        clearTimeout(timer);
        if (done) return;
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
          // Give an abort-ignoring provider time to report the actual bill. The bounded timer ends the reply; the
          // receipt is still asked. No late callback can reach the child.
        },
      };
      const timer = setTimeout(() => { entry.abort(); finish({ error: new Error("prepared request timed out") }); }, 6_000);
      open.set(key, entry);
      try {
        void Promise.resolve(asked.propose(brief as unknown as ModelInput, controller.signal,
          (text) => { if (!controller.signal.aborted) { soFar = text; listener?.(text); } },
          (usd) => { if (Number.isFinite(usd) && usd >= 0) reported = usd; },
          (cost) => { lookup = cost; }))
          .then((proposal) => { providerEnded = true; finish({ proposal }); }, (error: unknown) => { providerEnded = true; finish({ error }); });
      } catch (error) { providerEnded = true; finish({ error }); }
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
