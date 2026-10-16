import type { EmailCopy, EmailMessage, MailTransport, SendLedger } from "@/lib/email-delivery";

// In-memory adapters of the delivery module's seams, for tests (#149). Each step waits a tick, so two sends at once
// really interleave, as two requests do against Resend and the database.

const tick = () => new Promise((r) => setTimeout(r, 0));
const unknownError = (why: string) => `Resend delivery is unknown: ${why}. Check delivery before sending again.`;

/**
 * How the transport answers one send. "deliver": the email goes and the answer comes back. "refuse": the provider says
 * no (a 4xx); nothing goes. "no_answer": the request fails without an answer, and nothing goes. "lose_answer": the
 * email goes, then the answer is lost (a timeout after delivery).
 */
export type MemoryAnswer = "deliver" | "refuse" | "no_answer" | "lose_answer";

/** A transport that keeps each delivered message. Every send is delivered unless `answerNext` says otherwise. */
export function memoryTransport() {
  const delivered: (EmailMessage & { emailId: string })[] = [];
  const answers: MemoryAnswer[] = [];
  const transport: MailTransport = {
    async send(message) {
      await tick();
      const answer = answers.shift() ?? "deliver";
      if (answer === "refuse") return { status: "refused", error: "Resend answered 422: refused in the test" };
      if (answer === "no_answer") return { status: "unknown", error: unknownError("no answer in the test") };
      const emailId = `email-${delivered.length + 1}`;
      delivered.push({ ...message, emailId });
      if (answer === "lose_answer") return { status: "unknown", error: unknownError("the answer was lost in the test") };
      return { status: "sent", emailId };
    },
  };
  return {
    transport,
    delivered,
    /** How the coming sends answer, in order. Sends after these are delivered. */
    answerNext: (...list: MemoryAnswer[]) => void answers.push(...list),
  };
}

/** One claim in the in-memory ledger. */
export interface LedgerEntry {
  key: string;
  /** "claimed": a run holds it and is sending. "refused": released. "sent" and "unknown" stay claimed. */
  state: "claimed" | "sent" | "refused" | "unknown";
  /** When the latest claim was made, by the ledger's clock. */
  claimedAt: number;
  /** How many times the key was claimed: the send attempts. */
  claims: number;
  /** The fields written with the claims, the latest last. */
  fields: Record<string, string>;
  emailId: string | null;
  error: string | null;
}

interface MemoryLedgerOptions<K> {
  /** The entry for a key. Default: the key itself when it is a string, else its JSON. */
  keyOf?: (key: K) => string;
  /** The clock for claim times. Default: Date.now. */
  now?: () => number;
  /**
   * Whether a new claim may take over a claim that is still held ("claimed" or "unknown"): a run that stopped. Copy the
   * production ledger's rule here. Default: never. An email that went is never taken over.
   */
  canTakeOver?: (held: LedgerEntry, key: K, now: number) => boolean;
}

const jsonKey = <K>(key: K) => (typeof key === "string" ? key : JSON.stringify(key));

/**
 * A send ledger in memory that keeps the database's guards: one claim per key (a unique index), and a take-over that
 * only one of two runs at once can make (a guarded update). The check and the write of a claim happen in one step.
 */
export function memoryLedger<K>({ keyOf = jsonKey, now = Date.now, canTakeOver = () => false }: MemoryLedgerOptions<K> = {}) {
  const entries = new Map<string, LedgerEntry>();
  /** The kept copy of each key's email (D-103): the last attempt's. */
  const copies = new Map<string, EmailCopy>();
  const copy = (e: LedgerEntry): LedgerEntry => ({ ...e, fields: { ...e.fields } });
  const ledger: SendLedger<K, string> = {
    async claim(key, fields) {
      await tick();
      const id = keyOf(key);
      const held = entries.get(id);
      const at = now();
      // Only a released claim, or a held one the rule lets go, can be taken again.
      if (held && held.state !== "refused" && (held.state === "sent" || !canTakeOver(copy(held), key, at))) return null;
      entries.set(id, {
        key: id,
        state: "claimed",
        claimedAt: at,
        claims: (held?.claims ?? 0) + 1,
        fields: { ...held?.fields, ...fields },
        emailId: null,
        error: held?.error ?? null,
      });
      return id;
    },
    async sent(id, emailId) {
      await tick();
      Object.assign(entries.get(id)!, { state: "sent", emailId, error: null });
    },
    async refused(id, error) {
      await tick();
      Object.assign(entries.get(id)!, { state: "refused", error });
    },
    async unknown(id, error) {
      await tick();
      Object.assign(entries.get(id)!, { state: "unknown", error });
    },
    async keepCopy(id, _key, kept) {
      await tick();
      copies.set(id, kept);
    },
  };
  return {
    ledger,
    /** A copy of the entry for this key, if it was ever claimed. */
    entry: (key: K): LedgerEntry | undefined => {
      const e = entries.get(keyOf(key));
      return e && copy(e);
    },
    /** The kept copy of this key's email, if one was kept. */
    keptCopy: (key: K): EmailCopy | undefined => copies.get(keyOf(key)),
  };
}
