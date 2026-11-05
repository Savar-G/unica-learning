// Maya's spending cap (D-290, D-291): what Maya's paid provider requests may cost, kept in one ledger on the server.
//
// - A child may use CAD 10 of Maya a week (WEEK_CAD, Savar's decision of 2026-11-05). The week is the minutes ledger's:
//   Monday 00:00 to Monday 00:00 in the family's time zone (src/lib/family-time.ts `weekOf`).
// - All of Maya together may use a monthly total (MAYA_MONTHLY_CAP_CAD, default CAD 400), by calendar month in Pacific
//   time. Admin test calls and the local practice tools count only toward this total, never toward a child's week.
// - Amounts are whole micro-units of CAD (1 CAD = 1 000 000). Providers report US dollars; one configured rate turns
//   them into CAD (MAYA_USD_TO_CAD, default 1.40).
// - Every paid request is reserved before it is sent (the model, the free-talk review, the call note's AI, the voice
//   call's speech-to-text and voice) and settled with its actual cost when it comes back. A request whose cost is not
//   known (no answer, a time-out, an answer without a cost) stays counted at its reservation. The reservation and the
//   check are one database function under one lock (`reserve_maya_spend`, migration add_maya_spend), so requests sent
//   together cannot spend past the cap. When the ledger cannot be read, no new paid work starts.
// - "open": a model request still fits. "week_used": the child's week does not fit one more model request; Maya closes
//   the call with a code-written line, and new chats and calls wait for the next week. "paused": the monthly total does
//   not fit one, or the ledger cannot be read; every child waits, and the team gets one email per month.
// - Safety guidance needs no paid request (code writes it), so the cap never stops it.
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
export const DEFAULT_MONTHLY_CAD = 400;
/** The monthly total's calendar month is Pacific time (the business's own zone). */
export const SPEND_MONTH_ZONE: FamilyZone = PACIFIC_ZONE;

/**
 * What one request reserves before it is sent, in US dollars: above what one request costs on the default models
 * (Maya's turn on Sonnet with its whole prompt, a short Haiku review, a call note's one pick), so a reservation rarely
 * settles higher. The settle replaces it with the actual cost.
 */
export const RESERVE_USD = { model: 0.15, review: 0.02, note: 0.05 } as const;
/** Speech-to-text is reserved ahead for this long at a time while a voice call runs. */
export const VOICE_BLOCK_MS = 60_000;
export const DEFAULT_STT_USD_PER_MINUTE = 0.01;
export const DEFAULT_VOICE_USD_PER_1K_CHARS = 0.03;

export type SpendWhat = "model" | "review" | "note" | "speech_to_text" | "voice";
export type SpendState = "open" | "week_used" | "paused";

export interface SpendConfig {
  usdToCad: number;
  monthlyMicros: number;
  sttUsdPerMinute: number;
  voiceUsdPer1kChars: number;
}

const positive = (value: string | undefined, fallback: number) => {
  const n = Number(value?.trim());
  return value?.trim() && Number.isFinite(n) && n > 0 ? n : fallback;
};

/** The settings: MAYA_USD_TO_CAD, MAYA_MONTHLY_CAP_CAD, MAYA_STT_USD_PER_MINUTE, MAYA_VOICE_USD_PER_1K_CHARS. */
export function spendConfig(env: Readonly<Record<string, string | undefined>> = process.env): SpendConfig {
  return {
    usdToCad: positive(env.MAYA_USD_TO_CAD, DEFAULT_USD_TO_CAD),
    monthlyMicros: Math.round(positive(env.MAYA_MONTHLY_CAP_CAD, DEFAULT_MONTHLY_CAD) * MICROS_PER_CAD),
    sttUsdPerMinute: positive(env.MAYA_STT_USD_PER_MINUTE, DEFAULT_STT_USD_PER_MINUTE),
    voiceUsdPer1kChars: positive(env.MAYA_VOICE_USD_PER_1K_CHARS, DEFAULT_VOICE_USD_PER_1K_CHARS),
  };
}

/** US dollars as micro-units of CAD at the configured rate, rounded up. */
export const usdToMicros = (usd: number, config: Pick<SpendConfig, "usdToCad">): number => Math.max(0, Math.ceil(usd * config.usdToCad * MICROS_PER_CAD - 1e-6));

/** Who pays: a child's week and the monthly total, or the monthly total only (admin test calls, local tools). */
export type Charge = { kind: "child"; parentId: string; childId: string } | { kind: "global"; parentId: string | null; childId: string | null };

/** What the ledger needs of a call. */
export interface SpendCall {
  id: string;
  kind: string;
  parentId: string;
  childId: string;
}

/** An admin test call counts only toward the monthly total; every other call is the child's. */
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
  monthMicros: number;
  /** Counted even past a cap: speech of words already chosen. */
  force: boolean;
}

/** The store seam. Every call throws when the store cannot answer. */
export interface SpendStore {
  /**
   * Stores the reservation when it fits: the month's counted micros plus this one at most monthMicros, and for a child
   * the week's at most weekMicros. Atomic for all of Maya: two reservations at once never both take the last room. The
   * same id again changes nothing and answers ok.
   */
  reserve(r: ReserveRequest): Promise<{ ok: true } | { ok: false; over: "week" | "month" }>;
  /** The actual cost; null keeps the reservation counted (the cost is not known). The first settle stays. */
  settle(id: string, micros: number | null): Promise<void>;
  /** Counted micros: a settled request at its cost, any other at its reservation. */
  used(q: { childId: string | null; week: string | null; month: string }): Promise<{ week: number; month: number }>;
  /** True the first time for a month: the monthly alert goes once. */
  claimAlert(month: string): Promise<boolean>;
}

// ---------- the ledger ----------

export type Reservation = { ok: true } | { ok: false; state: Exclude<SpendState, "open"> };

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
  /** The child's week for Parent home and the desk. Throws when the ledger cannot answer. */
  week(input: { parentId: string; childId: string }): Promise<WeekSpend>;
}

export interface SpendSeams {
  store: SpendStore;
  clock: () => number;
  config: SpendConfig;
  /** The family's time zone (the shared rule of src/lib/family-time.ts). */
  zone(parentId: string): Promise<FamilyZone>;
  /** The team's email when the monthly total is reached; called once per month. */
  alert?(month: string): Promise<void>;
}

export function createSpendLedger(seams: SpendSeams): SpendLedger {
  const { store, clock, config } = seams;
  const room = usdToMicros(RESERVE_USD.model, config);
  const month = () => monthOf(clock(), SPEND_MONTH_ZONE).start;

  async function alertOnce(m: string) {
    try {
      if (seams.alert && (await store.claimAlert(m))) await seams.alert(m);
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
    if (used.month + room > config.monthlyMicros) {
      await alertOnce(p.month);
      return "paused";
    }
    return charge.kind === "child" && used.week + room > WEEK_MICROS ? "week_used" : "open";
  }

  const ledger: SpendLedger = {
    config,
    async reserve({ id, charge, callId = null, what, micros, force = false }) {
      if (!Number.isSafeInteger(micros) || micros < 0) throw new Error("maya spend: a reservation is whole micro-units");
      const p = await periods(charge);
      const r = await store.reserve({
        id, charge: charge.kind, parentId: charge.parentId, childId: charge.childId, callId, what, micros,
        week: p.week, weekMicros: WEEK_MICROS, month: p.month, monthMicros: config.monthlyMicros, force,
      });
      if (r.ok) return r;
      if (r.over === "month") await alertOnce(p.month);
      return { ok: false, state: r.over === "month" ? "paused" : "week_used" };
    },
    settle: (id, micros) => store.settle(id, micros === null ? null : Math.max(0, Math.ceil(micros))),
    settleUsd: (id, usd) => store.settle(id, usd === null ? null : usdToMicros(usd, config)),
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
      const state: SpendState = used.month + room > config.monthlyMicros ? "paused" : used.week + room > WEEK_MICROS ? "week_used" : "open";
      return { usedMicros: used.week, weekMicros: WEEK_MICROS, state, notice: used.week >= NOTICE_SHARE * WEEK_MICROS, resetsAt: p.resetsAt!, zone: p.zone! };
    },
  };
  return ledger;
}

// ---------- the call seam ----------

/** A voice call's speech-to-text and voice, reserved and counted as the call runs. */
export interface VoiceMeter {
  /** Reserves speech-to-text ahead when the current block is used. "open", or why no more may be reserved. */
  ensure(): Promise<SpendState>;
  /** Counts the voice for words Maya is about to say (always counted: the words are already chosen). */
  speech(text: string): Promise<void>;
  /** Settles the open speech-to-text block at the time used. Safe to call twice. */
  stop(): Promise<void>;
}

/** What the call module (src/lib/maya-call.ts) asks of the ledger. */
export interface CallSpend {
  readonly ledger: SpendLedger;
  /** Whether the call may make its next paid request. Never throws. */
  state(call: SpendCall): Promise<SpendState>;
  /** The voice meter of a voice call. */
  voice(call: SpendCall): VoiceMeter;
}

export function callSpend(ledger: SpendLedger, seams: { clock: () => number; newId: () => string }): CallSpend {
  return {
    ledger,
    state: (call) => ledger.state(chargeOf(call)),
    voice(call) {
      const charge = chargeOf(call);
      const perMs = ledger.config.sttUsdPerMinute / 60_000;
      let block: { id: string; from: number } | null = null;
      let refused: Exclude<SpendState, "open"> | null = null;
      const close = async (at: number) => {
        if (!block) return;
        const b = block;
        block = null;
        await ledger.settleUsd(b.id, Math.max(0, at - b.from) * perMs);
      };
      return {
        async ensure() {
          if (refused) return refused;
          const now = seams.clock();
          if (block && now < block.from + VOICE_BLOCK_MS) return "open";
          try {
            await close(now);
            const id = seams.newId();
            const r = await ledger.reserve({ id, charge, callId: call.id, what: "speech_to_text", micros: usdToMicros(VOICE_BLOCK_MS * perMs, ledger.config) });
            if (!r.ok) return (refused = r.state);
            block = { id, from: now };
            return "open";
          } catch (e) {
            console.error("[maya spend] speech-to-text not reserved", call.id, e instanceof Error ? e.message : String(e));
            return (refused = "paused");
          }
        },
        async speech(text) {
          const chars = text.length;
          if (chars === 0) return;
          const usd = (chars / 1000) * ledger.config.voiceUsdPer1kChars;
          const id = seams.newId();
          try {
            const r = await ledger.reserve({ id, charge, callId: call.id, what: "voice", micros: usdToMicros(usd, ledger.config), force: true });
            if (r.ok) await ledger.settleUsd(id, usd);
          } catch (e) {
            console.error("[maya spend] voice not counted", call.id, e instanceof Error ? e.message : String(e));
          }
        },
        async stop() {
          try {
            await close(seams.clock());
          } catch (e) {
            console.error("[maya spend] speech-to-text not settled", call.id, e instanceof Error ? e.message : String(e));
          }
        },
      };
    },
  };
}

/**
 * Counts what a local tool spent (the practice suite on the API) toward the monthly total only, after the run: the tool
 * has its own cap (--max-usd), so this is counted, not refused.
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
  paused: { line: "I have to stop here for now. You worked hard today. Bye for now!", detail: "Maya is taking a short break" },
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
