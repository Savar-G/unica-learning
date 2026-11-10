// The Families page as a board (D-313, D-315): every family in a column by how far it got, the waitlist and the
// cancelled families in slim lanes below, and the same families as a list. Pure: no network, database or clock (the
// caller passes the dashboard it already built and its progress snapshot). It invents no stage rule: each column holds
// stages of admin-dashboard.ts, and a card's "needs you" reasons are the dashboard's own Needs you list.
import { gradeLabel } from "@/lib/assessment/grades";
import { EMAIL_LABEL, STAGE_SHORT, at, ago, emailFailed, since, type Dashboard, type EmailEvent, type Family, type Stage } from "@/lib/admin-dashboard";
import type { ProgressSnapshot } from "@/lib/admin-progress";
import { formatInZone, localDay, PACIFIC_ZONE } from "@/lib/family-time";
import { CURRICULA } from "@/lib/signup";

export type BoardColumnKey = "signed" | "testing" | "report" | "card" | "customer";
export type BoardLaneKey = "waitlist" | "cancelled";
export type BoardKey = BoardColumnKey | BoardLaneKey;
export type BoardTone = "muted" | "info" | "sun" | "ok" | "bad";

export interface BoardGroup { key: BoardKey; label: string; stages: readonly Stage[]; tone: BoardTone; empty: string }

/** The board's columns in funnel order. A column can hold more than one stage; its cards then name their own stage. */
export const BOARD_COLUMNS: readonly (BoardGroup & { key: BoardColumnKey })[] = [
  { key: "signed", label: "Signed up", stages: ["account"], tone: "muted", empty: "No one is waiting to start the test" },
  { key: "testing", label: "Taking the test", stages: ["started"], tone: "info", empty: "No one is taking the test" },
  { key: "report", label: "Report sent", stages: ["finished", "card_started"], tone: "info", empty: "No reports waiting for a card" },
  { key: "card", label: "Card saved", stages: ["card_saved"], tone: "sun", empty: "No saved cards waiting" },
  { key: "customer", label: "Customer", stages: ["trial", "paying"], tone: "ok", empty: "No customers yet" },
];
/** The slim lanes below the board: families beside the funnel, not on the way through it. */
export const BOARD_LANES: readonly (BoardGroup & { key: BoardLaneKey })[] = [
  { key: "waitlist", label: "Waitlist", stages: ["waitlist"], tone: "muted", empty: "No one on the waitlist" },
  { key: "cancelled", label: "Cancelled", stages: ["cancelled"], tone: "bad", empty: "No cancelled plans" },
];
const GROUPS: readonly BoardGroup[] = [...BOARD_COLUMNS, ...BOARD_LANES];

/** The column or lane that holds a stage. Every stage has exactly one. */
export function groupOf(stage: Stage): BoardKey {
  return GROUPS.find((g) => g.stages.includes(stage))!.key;
}

/** Cards a column shows before "Show all". */
export const BOARD_COLUMN_MAX = 20;
/** "New": a card saved in the last 7 days, as the site recorded it. The same rule as the Families badge in the sidebar. */
export const NEW_DAYS = 7;
/** A child the server saw within this time counts as taking the test right now (as the live progress cell). */
export const LIVE_MS = 3 * 60_000;
const DAY_MS = 86_400_000;

/** A family is new when the site recorded a card save in the last NEW_DAYS. Test families are never new. */
export function isNewFamily(f: Family, now: number): boolean {
  const from = now - NEW_DAYS * DAY_MS;
  return !f.test && f.cards.some((c) => !c.foundInStripe && c.savedAt !== null && Date.parse(c.savedAt) >= from && Date.parse(c.savedAt) <= now);
}

/** Whether a child of the family is in a test right now: a test still open that the server saw within LIVE_MS. */
export function isLive(f: Family, progress: ProgressSnapshot): boolean {
  const now = Date.parse(progress.now);
  return f.tests.some((t) => {
    const p = progress.tests[t.id];
    return !!p && p.open && now - Date.parse(p.lastActivityAt) <= LIVE_MS;
  });
}

/** Each family's reasons from the dashboard's Needs you list (real families only, as that list). */
export function needsByFamily(d: Pick<Dashboard, "needs">): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const n of d.needs) for (const f of n.families) out.set(f.id, [...(out.get(f.id) ?? []), n.title]);
  return out;
}

/** "AM" for "Arjun Mehta"; "?" when there is no name. */
export function initials(name: string): string {
  const s = name.trim().split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return s || "?";
}

/** How many children a card names before "and N more". */
const KIDS_SHOWN = 3;

/** "Mira, Grade 3", or "Ethan, Gr 2 · Chloe, K" for more than one child; past 3 children, "and 29 more". */
export function kidsLine(f: Family): string {
  if (f.children.length === 0) return "No child yet";
  if (f.children.length === 1) return `${f.children[0].name}, ${gradeLabel(f.children[0].grade)}`;
  const shown = f.children.slice(0, KIDS_SHOWN).map((c) => `${c.name}, ${c.grade === 0 ? "K" : `Gr ${c.grade}`}`).join(" · ");
  const rest = f.children.length - KIDS_SHOWN;
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

/** How long the family has been in its stage: "since 9:15 a.m." on the same Pacific day, else "4 days" or "20 h". */
export function timeInStage(f: Family, now: string): string {
  if (localDay(f.stageAt, PACIFIC_ZONE) === localDay(now, PACIFIC_ZONE)) return `since ${formatInZone(f.stageAt, PACIFIC_ZONE, { hour: "numeric", minute: "2-digit" })}`;
  return since(f.stageAt, now);
}

function emailWords(e: EmailEvent, now: string): string {
  if (emailFailed(e)) return `${EMAIL_LABEL[e.kind]} did not reach the parent`;
  if (e.status === "pending") return `${EMAIL_LABEL[e.kind]} waiting to send`;
  return `${EMAIL_LABEL[e.kind]} sent ${ago(e.at, now)}`;
}

/** One short line on where the family stands: the test, the last email, the plan. Built from the dashboard's data. */
export function statusLine(f: Family, progress: ProgressSnapshot, now: string): string {
  // a time ends in "a.m." or "p.m.", so the sentence's own full stop is dropped there
  return statusWords(f, progress, now).replace(/\.\./g, ".");
}

function statusWords(f: Family, progress: ProgressSnapshot, now: string): string {
  const email = f.lastEmail ? emailWords(f.lastEmail, now) : null;
  const off = f.unsubscribed ? "Turned reminders off" : null;
  switch (f.stage) {
    case "account": {
      if (off) return `Test not started. ${off}.`;
      if (email) return `Test not started. ${email}.`;
      const next = f.nextReminders[0];
      return next ? `Test not started. ${EMAIL_LABEL[next.kind]} ${Date.parse(next.at) <= Date.parse(now) ? "due now" : `due ${at(next.at)}`}.` : "Test not started.";
    }
    case "started": {
      if (f.expired) return "The test expired before the end.";
      const open = f.tests.find((t) => progress.tests[t.id]?.open) ?? f.tests.find((t) => t.id in progress.tests);
      const p = open ? progress.tests[open.id] : null;
      if (p) return f.children.length > 1 && open ? `${open.childName}: ${p.text}.` : `${p.text}.`;
      const t = f.tests[0];
      return t ? `${t.answered} answer${t.answered === 1 ? "" : "s"} so far.` : "Test started.";
    }
    case "finished":
      return off ? `${email ? `${email}. ` : ""}${off}.` : email ? `${email}.` : "Test finished.";
    case "card_started":
      return "Opened the payment page, no card saved.";
    case "card_saved": {
      const saved = f.cards.filter((c) => c.savedAt).length;
      return `${saved > 1 ? `${saved} cards` : "Card"} saved. No plan started yet.`;
    }
    case "trial":
      return f.subscription ? `Free month since ${at(f.subscription.since)}.` : "In the free month.";
    case "paying":
      return f.subscription ? `Paying CAD ${f.subscription.monthly.toFixed(2)} a month.` : "Paying.";
    case "cancelled":
      return f.subscription?.endedAt ? `Plan ended ${at(f.subscription.endedAt)}.` : "Plan ended.";
    case "waitlist": {
      const places = [...new Set(f.children.map((c) => c.province))].filter((p) => p !== "other").map((p) => CURRICULA[p]);
      return places.length ? `Waiting for ${places.join(" and ")}.` : "Waiting for their curriculum.";
    }
  }
}

export interface BoardCard {
  id: string;
  name: string;
  initials: string;
  /** Picks the avatar tint; the same family always gets the same one. */
  hue: number;
  kids: string;
  since: string;
  status: string;
  /** The family's own stage when it is not its column's first ("Payment page" under Report sent, "Paying" under Customer). */
  stageLabel: string | null;
  isNew: boolean;
  live: boolean;
  test: boolean;
  /** Why the team should look: the dashboard's Needs you titles. Empty when nothing waits. */
  needs: string[];
}

export interface BoardGroupView extends BoardGroup {
  /** Real families in it (test families never count). */
  count: number;
  /** Test families in it, shown only while the switch is on. */
  tests: number;
  /** Every family in it, shown or not. */
  total: number;
  /** Needs you first, then the most recent in the stage; at most `max`. */
  cards: BoardCard[];
}

export interface Board { columns: BoardGroupView[]; lanes: BoardGroupView[] }

const hueOf = (id: string) => [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7) % 5;

export function boardCard(f: Family, ctx: { needs: Map<string, string[]>; progress: ProgressSnapshot; now: string }): BoardCard {
  const group = GROUPS.find((g) => g.key === groupOf(f.stage))!;
  return {
    id: f.id, name: f.name, initials: initials(f.name), hue: hueOf(f.id), kids: kidsLine(f),
    since: timeInStage(f, ctx.now), status: statusLine(f, ctx.progress, ctx.now),
    stageLabel: group.stages[0] !== f.stage ? STAGE_SHORT[f.stage] : null,
    isNew: isNewFamily(f, Date.parse(ctx.now)), live: isLive(f, ctx.progress), test: f.test,
    needs: f.test ? [] : (ctx.needs.get(f.id) ?? []),
  };
}

/** Whether a family matches the search: the parent's name or email, or a child's name. */
export function familyMatches(f: Family, q: string): boolean {
  const words = q.trim().toLowerCase();
  return !words || `${f.name} ${f.email} ${f.children.map((c) => c.name).join(" ")}`.toLowerCase().includes(words);
}

/**
 * The board of `families` (already narrowed by the switch and the search). `needs`: needsByFamily of the dashboard.
 * `now`: the dashboard's time.
 */
export function buildBoard(families: readonly Family[], ctx: { needs: Map<string, string[]>; progress: ProgressSnapshot; now: string }, max = BOARD_COLUMN_MAX): Board {
  const view = (g: BoardGroup): BoardGroupView => {
    const mine = families.filter((f) => g.stages.includes(f.stage));
    const cards = mine.map((f) => boardCard(f, ctx))
      .map((c, i) => ({ c, at: mine[i].stageAt }))
      .sort((a, b) => Number(b.c.needs.length > 0) - Number(a.c.needs.length > 0) || b.at.localeCompare(a.at))
      .slice(0, max).map((x) => x.c);
    const tests = mine.filter((f) => f.test).length;
    return { ...g, count: mine.length - tests, tests, total: mine.length, cards };
  };
  return { columns: BOARD_COLUMNS.map(view), lanes: BOARD_LANES.map(view) };
}

/** The list's stage filter from the address: a column or lane key ("report"), or one stage ("card_started"). */
export function pickStageFilter(raw: unknown): { key: string; label: string; stages: readonly Stage[] } | null {
  if (typeof raw !== "string") return null;
  const g = GROUPS.find((x) => x.key === raw);
  if (g) return { key: g.key, label: g.label, stages: g.stages };
  const s = (Object.keys(STAGE_SHORT) as Stage[]).find((x) => x === raw);
  return s ? { key: s, label: STAGE_SHORT[s], stages: [s] } : null;
}

/** The page's own keys in the address; anything else (the dashboard's range, a family panel) is dropped. */
const KEEP = ["q", "view", "stage", "tests"] as const;

/** The Families page address with the query changed by `set` (null removes a key). A change of filter starts at page 1. */
export function familiesHref(path: string, query: Record<string, string | string[] | undefined>, set: Partial<Record<(typeof KEEP)[number] | "page", string | null>>): string {
  const q = new URLSearchParams();
  for (const k of KEEP) {
    const v = query[k];
    if (typeof v === "string" && v) q.set(k, v);
  }
  for (const [k, v] of Object.entries(set)) {
    if (v) q.set(k, v);
    else q.delete(k);
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
