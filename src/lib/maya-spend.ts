// Maya's spending cap (D-290, D-291): what Maya's paid provider requests may cost, kept in one ledger on the server.
//
// - A child may use CAD 10 of Maya a week (WEEK_CAD, Savar's decision of 2026-11-05). The week is the family's week:
//   Monday 00:00 to Monday 00:00 in the family's time zone (src/lib/family-time.ts `weekOf`).
// - No cap is shared between children. The month's total for all of Maya (calendar month, Pacific time) only sends the
//   team one email at MAYA_MONTHLY_ALERT_CAD (default CAD 400); it has no effect on access. Admin test calls, the local
//   practice tools and safety reads count only toward this total, never toward a child's week.
// - Amounts are whole micro-units of CAD (1 CAD = 1 000 000). Providers report US dollars; one configured rate turns
//   them into CAD (MAYA_USD_TO_CAD, default 1.40).
// - Each provider attempt is reserved before it is sent (the model, the free-talk review, the call note's AI, the
//   profile's AI, the voice call's speech-to-text) and settled with its actual cost when it comes back. An attempt whose
//   cost is not known (no answer, a time-out, an answer without a cost) stays counted at its reservation. A reservation
//   left open past RESERVATION_TTL_MS (a crash) stops counting, so it cannot lock a child out. The reservation and the
//   check are one database function under the child's lock (`reserve_maya_spend`), so requests sent together cannot spend
//   past the cap. When the ledger cannot be read, no new paid work starts.
// - Before a call's turn, the cap's check and the reservation of the turn's first model attempt are that one request
//   (`hold`, Savar 2026-11-13): the attempt takes the held reservation and sends with no request of its own. A turn
//   that asked no model gives it back (`release`, settled at nothing).
// - The voice is counted where it is made: when audio came back from the voice provider (`VoiceMeter.spoken`).
// - "open": a model request still fits. "week_used": the child's week does not fit one more; Maya closes the call with a
//   code-written line, and new chats and calls wait for the next week. "paused": the ledger cannot be read.
// - Safety is never held back by the cap. The danger is read by the model (the proposal's reading), so the child's words
//   at the cap get one safety read that cannot be refused and is off the child's week (`Meter.safetyRead`); the guidance
//   itself is code's and needs no request.
//
// Seams: the store (Supabase: src/lib/maya-spend-store.ts; memory: src/lib/maya-spend-memory.ts), the clock, the
// family's time zone and the alert. Pure otherwise: no network, database or Next.js.

import { formatInZone, monthOf, PACIFIC_ZONE, weekOf, type FamilyZone } from "@/lib/family-time";

export const MICROS_PER_CAD = 1_000_000;
/** A child's weekly amount for Maya, in CAD (Savar, 2026-11-05). */
export const WEEK_CAD = 10;
export const WEEK_MICROS = WEEK_CAD * MICROS_PER_CAD;
/** Parent home tells the parent when this share of the week is used. */
export const NOTICE_SHARE = 0.8;
export const DEFAULT_USD_TO_CAD = 1.4;
/** The month's total that sends the team one email. It stops nobody. */
export const DEFAULT_MONTHLY_ALERT_CAD = 400;
/** A reservation left unsettled this long stops counting (a crash). A settled unknown cost stays counted. Also in the database function. */
export const RESERVATION_TTL_MS = 10 * 60_000;
/** The month's calendar month is Pacific time (the business's own zone). */
export const SPEND_MONTH_ZONE: FamilyZone = PACIFIC_ZONE;

/**
 * What one request reserves before it is sent, in US dollars: above what one request costs on the default models
 * (Maya's turn on Sonnet with its whole prompt, a short Haiku review, a call note's one pick, the profile's findings), so a reservation rarely
 * settles higher. The settle replaces it with the actual cost.
 */
export const RESERVE_USD = { model: 0.15, review: 0.02, note: 0.05, profile: 0.3 } as const;
/** Speech-to-text is reserved ahead for this long at a time while a voice call runs. */
export const VOICE_BLOCK_MS = 60_000;
/** The next block is reserved this long before the current one ends, so the stream never runs past what is reserved. */
export const VOICE_RENEW_EARLY_MS = 20_000;
/** How often the worker asks the meter, whatever the child is doing. Less than VOICE_RENEW_EARLY_MS. */
export const VOICE_METER_TICK_MS = 10_000;
export const DEFAULT_STT_USD_PER_MINUTE = 0.01;
export const DEFAULT_VOICE_USD_PER_1K_CHARS = 0.03;

export type SpendWhat = "model" | "review" | "note" | "profile" | "speech_to_text" | "voice";
export type SpendState = "open" | "week_used" | "paused";

export interface SpendConfig {
  usdToCad: number;
  monthlyAlertMicros: number;
  sttUsdPerMinute: number;
  voiceUsdPer1kChars: number;
}

const positive = (value: string | undefined, fallback: number) => {
  const n = Number(value?.trim());
  return value?.trim() && Number.isFinite(n) && n > 0 ? n : fallback;
};

/** The settings: MAYA_USD_TO_CAD, MAYA_MONTHLY_ALERT_CAD, MAYA_STT_USD_PER_MINUTE, MAYA_VOICE_USD_PER_1K_CHARS. */
export function spendConfig(env: Readonly<Record<string, string | undefined>> = process.env): SpendConfig {
  return {
    usdToCad: positive(env.MAYA_USD_TO_CAD, DEFAULT_USD_TO_CAD),
    monthlyAlertMicros: Math.round(positive(env.MAYA_MONTHLY_ALERT_CAD, DEFAULT_MONTHLY_ALERT_CAD) * MICROS_PER_CAD),
    sttUsdPerMinute: positive(env.MAYA_STT_USD_PER_MINUTE, DEFAULT_STT_USD_PER_MINUTE),
    voiceUsdPer1kChars: positive(env.MAYA_VOICE_USD_PER_1K_CHARS, DEFAULT_VOICE_USD_PER_1K_CHARS),
  };
}

/** US dollars as micro-units of CAD at the configured rate, rounded up. */
export const usdToMicros = (usd: number, config: Pick<SpendConfig, "usdToCad">): number => Math.max(0, Math.ceil(usd * config.usdToCad * MICROS_PER_CAD - 1e-6));

/** Who pays: a child's week and the month's total, or the month's total only (admin test calls, local tools, safety reads). */
export type Charge = { kind: "child"; parentId: string; childId: string } | { kind: "global"; parentId: string | null; childId: string | null };

/** What the ledger needs of a call. */
export interface SpendCall {
  id: string;
  kind: string;
  parentId: string;
  childId: string;
}

/** An admin test call counts only toward the month's total; every other call is the child's. */
export function chargeOf(call: Pick<SpendCall, "kind" | "parentId" | "childId">): Charge {
  return call.kind === "admin_test" ? { kind: "global", parentId: call.parentId, childId: call.childId } : { kind: "child", parentId: call.parentId, childId: call.childId };
}

// ---------- the store ----------

export interface ReserveRequest {
  id: string;
  charge: Charge["kind"];
  parentId: string | null;
  childId: string | null;
  callId: string | null;
  what: SpendWhat;
  micros: number;
  /** The child's local Monday (YYYY-MM-DD) for a child's charge, else null. */
  week: string | null;
  weekMicros: number;
  /** The first day of the month (YYYY-MM-DD). */
  month: string;
  /** Counted even past the cap: speech of words already said. */
  force: boolean;
}

/** The store seam. Every call throws when the store cannot answer. */
export interface SpendStore {
  /**
   * Stores the reservation when it fits: for a child, the week's counted micros plus this one at most weekMicros. Atomic
   * per child: two reservations at once never both take the last room. The same id again changes nothing and answers ok.
   * `monthMicros`: the month's counted micros, for the team's alert.
   */
  reserve(r: ReserveRequest): Promise<{ ok: true; monthMicros: number } | { ok: false; over: "week" }>;
  /**
   * The actual cost; null keeps the reservation counted (the cost is not known). The first settle stays. Answers the
   * month the reservation is in (YYYY-MM-DD) when this call settled it, else null.
   */
  settle(id: string, micros: number | null): Promise<string | null>;
  /** Counted micros: a settled request at its cost, an unknown cost at its reservation, an open one until RESERVATION_TTL_MS. */
  used(q: { childId: string | null; week: string | null; month: string }): Promise<{ week: number; month: number }>;
  /** True the first time for a month: the monthly alert goes once. */
  claimAlert(month: string): Promise<boolean>;
}

// ---------- the ledger ----------

export type Reservation = { ok: true } | { ok: false; state: "week_used" };

export interface WeekSpend {
  usedMicros: number;
  weekMicros: number;
  state: SpendState;
  /** At least NOTICE_SHARE of the week is used. */
  notice: boolean;
  /** When the week's amount comes back (ms since 1970). */
  resetsAt: number;
  zone: FamilyZone;
}

export interface SpendLedger {
  readonly config: SpendConfig;
  /** Reserves before a paid request. Throws when the ledger cannot answer: then the request is not sent. */
  reserve(input: { id: string; charge: Charge; callId?: string | null; what: SpendWhat; micros: number; force?: boolean }): Promise<Reservation>;
  /** Settles with the actual cost in micros, or null when it is not known. Throws when the ledger cannot answer. */
  settle(id: string, micros: number | null): Promise<void>;
  /** Settles with the actual cost in US dollars, or null when it is not known. */
  settleUsd(id: string, usd: number | null): Promise<void>;
  /** Whether new paid work may start for this charge. Never throws: a ledger that cannot be read is "paused". */
  state(charge: Charge): Promise<SpendState>;
  /**
   * The cap's check before a call's turn and the reservation of the turn's first model attempt, in one store request:
   * `reserve` of one model attempt, whose check under the child's lock is the same as `state` ("open" while one more
   * model attempt fits). "open": reserved, and held for the call: the call's next model attempt of the same charge
   * (`reserve` with `what: "model"`, its `callId`, no `force`) takes it instead of reserving again, and its settle
   * settles it. "week_used": nothing reserved. "paused": the ledger could not answer. Never throws.
   */
  hold(input: { id: string; charge: Charge; callId: string }): Promise<SpendState>;
  /** Settles a held reservation that no attempt took at nothing (no request was sent). Nothing when it was taken. Never throws. */
  release(id: string): Promise<void>;
  /** The child's week for Parent home and the desk. Throws when the ledger cannot answer. */
  week(input: { parentId: string; childId: string }): Promise<WeekSpend>;
}

export interface SpendSeams {
  store: SpendStore;
  clock: () => number;
  config: SpendConfig;
  /** The family's time zone (the shared rule of src/lib/family-time.ts). */
  zone(parentId: string): Promise<FamilyZone>;
  /** The team's email when the month's total reaches MAYA_MONTHLY_ALERT_CAD; called once per month. It stops nobody. */
  alert?(month: string): Promise<void>;
}

export function createSpendLedger(seams: SpendSeams): SpendLedger {
  const { store, clock, config } = seams;
  const room = usdToMicros(RESERVE_USD.model, config);
  const month = () => monthOf(clock(), SPEND_MONTH_ZONE).start;
  const told = new Set<string>();

  async function alertOnce(m: string) {
    if (!seams.alert || told.has(m)) return;
    told.add(m);
    try {
      if (await store.claimAlert(m)) await seams.alert(m);
    } catch (e) {
      console.error("[maya spend] monthly alert failed", e instanceof Error ? e.message : String(e));
    }
  }

  async function periods(charge: Charge) {
    if (charge.kind !== "child") return { week: null, resetsAt: null, zone: null, month: month() };
    const zone = await seams.zone(charge.parentId);
    const w = weekOf(clock(), zone);
    return { week: w.start, resetsAt: w.resetsAt, zone, month: month() };
  }

  async function stateOf(charge: Charge): Promise<SpendState> {
    const p = await periods(charge);
    const used = await store.used({ childId: charge.kind === "child" ? charge.childId : null, week: p.week, month: p.month });
    return charge.kind === "child" && used.week + room > WEEK_MICROS ? "week_used" : "open";
  }

  /**
   * Settles, then checks the reservation's own month: a cost higher than its reservation can carry that month's total
   * past the alert amount, which the reservation's own check did not see, also when the cost comes back after the month
   * changed. Read only while that month's alert has not gone from this process.
   */
  async function settled(id: string, micros: number | null) {
    const m = await store.settle(id, micros);
    if (!m || !seams.alert || told.has(m)) return;
    try {
      if ((await store.used({ childId: null, week: null, month: m })).month >= config.monthlyAlertMicros) await alertOnce(m);
    } catch (e) {
      console.error("[maya spend] the month's total could not be read after a settle", e instanceof Error ? e.message : String(e));
    }
  }

  /** One reservation in the store: the check and the write under the child's lock, and the month's alert. */
  async function write({ id, charge, callId, what, micros, force }: { id: string; charge: Charge; callId: string | null; what: SpendWhat; micros: number; force: boolean }): Promise<Reservation> {
    const p = await periods(charge);
    const r = await store.reserve({
      id, charge: charge.kind, parentId: charge.parentId, childId: charge.childId, callId, what, micros,
      week: p.week, weekMicros: WEEK_MICROS, month: p.month, force,
    });
    if (!r.ok) return { ok: false, state: "week_used" };
    if (r.monthMicros >= config.monthlyAlertMicros) await alertOnce(p.month);
    return { ok: true };
  }

  /** Model reservations made by `hold` that no attempt took yet, oldest first. In this process only. */
  const held: { id: string; callId: string; charge: Charge; micros: number }[] = [];
  /** An attempt's own id, to the held reservation it took: its settle settles that one. */
  const took = new Map<string, string>();
  const sameCharge = (a: Charge, b: Charge) => a.kind === b.kind && a.parentId === b.parentId && a.childId === b.childId;

  const ledger: SpendLedger = {
    config,
    async reserve({ id, charge, callId = null, what, micros, force = false }) {
      if (!Number.isSafeInteger(micros) || micros < 0) throw new Error("maya spend: a reservation is whole micro-units");
      if (took.has(id)) return { ok: true };
      // The call's model attempt after its hold: the held reservation is this attempt's, and no request is made. Taken
      // before any await, so two attempts never take the same one.
      const i = what === "model" && !force && callId !== null ? held.findIndex((h) => h.callId === callId && sameCharge(h.charge, charge) && micros <= h.micros) : -1;
      if (i >= 0) {
        took.set(id, held.splice(i, 1)[0].id);
        return { ok: true };
      }
      return write({ id, charge, callId, what, micros, force });
    },
    settle(id, micros) {
      const own = took.get(id) ?? id;
      took.delete(id);
      return settled(own, micros === null ? null : Math.max(0, Math.ceil(micros)));
    },
    settleUsd(id, usd) {
      const own = took.get(id) ?? id;
      took.delete(id);
      return settled(own, usd === null ? null : usdToMicros(usd, config));
    },
    async hold({ id, charge, callId }) {
      try {
        const r = await write({ id, charge, callId, what: "model", micros: room, force: false });
        if (!r.ok) return r.state;
        held.push({ id, callId, charge, micros: room });
        return "open";
      } catch (e) {
        console.error("[maya spend] the ledger could not be read", e instanceof Error ? e.message : String(e));
        return "paused";
      }
    },
    async release(id) {
      const i = held.findIndex((h) => h.id === id);
      if (i < 0) return;
      held.splice(i, 1);
      try {
        await settled(id, 0);
      } catch (e) {
        // Unsettled, it stops counting after RESERVATION_TTL_MS.
        console.error("[maya spend] a held reservation not given back", id, e instanceof Error ? e.message : String(e));
      }
    },
    async state(charge) {
      try {
        return await stateOf(charge);
      } catch (e) {
        console.error("[maya spend] the ledger could not be read", e instanceof Error ? e.message : String(e));
        return "paused";
      }
    },
    async week({ parentId, childId }) {
      const charge: Charge = { kind: "child", parentId, childId };
      const p = await periods(charge);
      const used = await store.used({ childId, week: p.week, month: p.month });
      const state: SpendState = used.week + room > WEEK_MICROS ? "week_used" : "open";
      return { usedMicros: used.week, weekMicros: WEEK_MICROS, state, notice: used.week >= NOTICE_SHARE * WEEK_MICROS, resetsAt: p.resetsAt!, zone: p.zone! };
    },
  };
  return ledger;
}

// ---------- the call seam ----------

/** A voice call's speech-to-text and voice, reserved and counted as the call runs. */
export interface VoiceMeter {
  /**
   * Reserves the next speech-to-text block when the current one is close to its end. One at a time: checks that come
   * together share one block. "open", or why no more may be reserved. After `stop`, it reserves nothing.
   */
  ensure(): Promise<SpendState>;
  /** Counts the voice of words that became audio. Always counted, and never throws: the words are already said. */
  spoken(text: string): Promise<void>;
  /** Settles the open speech-to-text block at the time used. Safe to call twice. */
  stop(): Promise<void>;
}

/** What the call module (src/lib/maya-call.ts) asks of the ledger. */
export interface CallSpend {
  readonly ledger: SpendLedger;
  /** Whether the call may make its next paid request. Never throws. */
  state(call: SpendCall): Promise<SpendState>;
  /**
   * Before a turn: the cap's state and the reservation of the turn's first model request, in one request
   * (`SpendLedger.hold`). The call's metered model client takes it, so it must use this same ledger. `release` gives it
   * back when no request took it: call it once the turn's model requests are over (safe to call again). Never throws.
   */
  hold(call: SpendCall): Promise<Held>;
  /** The voice meter of a voice call. */
  voice(call: SpendCall): VoiceMeter;
}

/** The cap's state before a turn, and the release of the model reservation it holds when "open". */
export interface Held {
  state: SpendState;
  release(): Promise<void>;
}

export function callSpend(ledger: SpendLedger, seams: { clock: () => number; newId: () => string }): CallSpend {
  return {
    ledger,
    state: (call) => ledger.state(chargeOf(call)),
    async hold(call) {
      const id = seams.newId();
      const state = await ledger.hold({ id, charge: chargeOf(call), callId: call.id });
      return { state, release: () => (state === "open" ? ledger.release(id) : Promise.resolve()) };
    },
    voice(call) {
      const charge = chargeOf(call);
      const perMs = ledger.config.sttUsdPerMinute / 60_000;
      let block: { id: string; from: number } | null = null;
      let refused: "week_used" | null = null;
      let stopped = false;
      const counting = new Set<Promise<void>>();
      let queue: Promise<unknown> = Promise.resolve();
      const inOrder = <T>(work: () => Promise<T>): Promise<T> => {
        const next = queue.then(work);
        queue = next.catch(() => {});
        return next;
      };
      const close = async (at: number) => {
        if (!block) return;
        const b = block;
        block = null;
        await ledger.settleUsd(b.id, Math.max(0, at - b.from) * perMs);
      };
      return {
        ensure: () => inOrder(async (): Promise<SpendState> => {
          if (refused) return refused;
          if (stopped) return "open";
          const now = seams.clock();
          if (block && now < block.from + VOICE_BLOCK_MS - VOICE_RENEW_EARLY_MS) return "open";
          const micros = usdToMicros(VOICE_BLOCK_MS * perMs, ledger.config);
          /**
           * No more fits: the call closes now, and speech-to-text runs only until it has ended. That last stretch is
           * still counted, as a block past the cap that `stop` settles at the time used.
           */
          const tail = async () => {
            try {
              const id = seams.newId();
              if ((await ledger.reserve({ id, charge, callId: call.id, what: "speech_to_text", micros, force: true })).ok) block = { id, from: now };
            } catch (e) {
              console.error("[maya spend] speech-to-text not counted", call.id, e instanceof Error ? e.message : String(e));
            }
          };
          try {
            await close(now);
            const id = seams.newId();
            const r = await ledger.reserve({ id, charge, callId: call.id, what: "speech_to_text", micros });
            if (!r.ok) {
              refused = r.state;
              await tail();
              return refused;
            }
            block = { id, from: now };
            return "open";
          } catch (e) {
            console.error("[maya spend] speech-to-text not reserved", call.id, e instanceof Error ? e.message : String(e));
            if (!block) await tail();
            return "paused";
          }
        }),
        spoken(text) {
          const usd = (text.length / 1000) * ledger.config.voiceUsdPer1kChars;
          if (usd === 0) return Promise.resolve();
          const id = seams.newId();
          const work = (async () => {
            try {
              const r = await ledger.reserve({ id, charge, callId: call.id, what: "voice", micros: usdToMicros(usd, ledger.config), force: true });
              if (r.ok) await ledger.settleUsd(id, usd);
            } catch (e) {
              console.error("[maya spend] voice not counted", call.id, e instanceof Error ? e.message : String(e));
            }
          })();
          counting.add(work);
          void work.finally(() => counting.delete(work));
          return work;
        },
        stop: () => inOrder(async () => {
          stopped = true;
          try {
            await close(seams.clock());
          } catch (e) {
            console.error("[maya spend] speech-to-text not settled", call.id, e instanceof Error ? e.message : String(e));
          }
          await Promise.all(counting);
        }),
      };
    },
  };
}

/**
 * Counts what a local tool spent (the practice suite on the API) toward the month's total only, after the run: never
 * toward a child's week. The tool has its own limit (--max-usd).
 */
export async function recordLocalSpend(ledger: SpendLedger, usd: number, id: string): Promise<void> {
  if (!(usd > 0)) return;
  const r = await ledger.reserve({ id, charge: { kind: "global", parentId: null, childId: null }, what: "model", micros: usdToMicros(usd, ledger.config), force: true });
  if (r.ok) await ledger.settleUsd(id, usd);
}

// ---------- the words ----------

/** Maya's last line when the cap closes a call, and the trace's detail for it. Code-written: no model request. */
export const SPEND_CLOSE: Record<Exclude<SpendState, "open">, { line: string; detail: string }> = {
  week_used: { line: "That's all our time for this week. You worked hard today. See you next week!", detail: "Maya's time for this week was used up" },
  paused: { line: "I have to stop here for now. You worked hard today. Bye for now!", detail: "Maya could not check her time" },
};

/** The detail of a call the cap closed, or null. */
export const spendCloseOf = (detail: string): Exclude<SpendState, "open"> | null =>
  detail === SPEND_CLOSE.week_used.detail ? "week_used" : detail === SPEND_CLOSE.paused.detail ? "paused" : null;

export const PAUSED_LINE = "Maya is taking a short break. There's no extra charge.";

/** What the child sees when Maya cannot start: the real reset day in the family's time zone. Null when open. */
export function childSpendLine(state: SpendState, resetsAt: number, zone: FamilyZone): string | null {
  if (state === "paused") return PAUSED_LINE;
  if (state === "week_used") return `You've used Maya's time for this week. She'll be back on ${formatInZone(resetsAt, zone, { weekday: "long" })}.`;
  return null;
}

/** What Parent home says about a child's week: used up, paused, or the notice at NOTICE_SHARE. Null otherwise. */
export function parentSpendLine(w: Pick<WeekSpend, "state" | "notice" | "resetsAt" | "zone">, name: string): string | null {
  const day = formatInZone(w.resetsAt, w.zone, { weekday: "long", month: "long", day: "numeric" });
  if (w.state === "paused") return PAUSED_LINE;
  if (w.state === "week_used") return `Maya's weekly time is used up. It resets on ${day}. There's no extra charge.`;
  if (w.notice) return `${name} has used most of Maya's time for this week. It resets on ${day}. There's no extra charge.`;
  return null;
}
