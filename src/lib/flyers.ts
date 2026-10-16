// The door-to-door flyer test: two printed flyers (A and B), each with its own QR code to /f/<code>. The route
// counts the scan and sends the visitor on to /start, tagged so the signup keeps the flyer (parents.source). This
// file holds what the route and the admin page share: the flyers, the destination and the numbers, with no network.
import type { Stage } from "@/lib/admin-dashboard";

export const FLYERS = {
  a: { name: "Flyer A", headline: "A math learning program made for your child.", look: "Photo of a boy writing, price in handwriting" },
  b: { name: "Flyer B", headline: "A workbook made for one child: yours.", look: "Colour field, rounded cards, tilted photo" },
} as const;
export type FlyerCode = keyof typeof FLYERS;
export const FLYER_CODES = Object.keys(FLYERS) as FlyerCode[];
export const isFlyerCode = (s: string): s is FlyerCode => Object.hasOwn(FLYERS, s);

export const FLYER_SOURCE = "flyer";
export const FLYER_CAMPAIGN = "door-to-door";

/** The path a scan continues to: the free assessment signup, tagged with the flyer. */
export function flyerDestination(code: FlyerCode): string {
  const tags = new URLSearchParams({ utm_source: FLYER_SOURCE, utm_medium: "print", utm_campaign: FLYER_CAMPAIGN, utm_content: code });
  return `/start?${tags}`;
}

/** The address printed (as a QR code) on a flyer. */
export const flyerUrl = (code: FlyerCode, origin = "https://unicalearning.com") => `${origin}/f/${code}`;

// Link previews and crawlers fetch a link without a person behind it. They are not counted.
const NOT_A_PERSON = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|curl|wget|python|go-http|headless|monitor/i;
export const isLikelyBot = (userAgent: string | null) => !userAgent || NOT_A_PERSON.test(userAgent);

export interface FlyerRow {
  code: FlyerCode;
  /** Handed out, typed by an admin; 0 when not entered yet. */
  delivered: number;
  scans: number;
  /** Signups (one family each) that came from this flyer. */
  accounts: number;
  started: number;
  finished: number;
  cardSaved: number;
  paying: number;
}

export interface FlyerInput {
  parents: { id: string; source: Record<string, string> | null }[];
  families: { id: string; test: boolean; reached: Partial<Record<Stage, string>> }[];
  scans: Partial<Record<FlyerCode, number>>;
  delivered: Partial<Record<FlyerCode, number>>;
  /** Count the team and test families too. */
  withTests?: boolean;
}

/** The flyer a signup came from, by the tags the signup form kept; null when it did not come from a flyer. */
export function flyerOf(source: Record<string, string> | null): FlyerCode | null {
  if (source?.utm_source?.trim().toLowerCase() !== FLYER_SOURCE) return null;
  const content = source.utm_content?.trim().toLowerCase() ?? "";
  return isFlyerCode(content) ? content : null;
}

export function flyerRows({ parents, families, scans, delivered, withTests = false }: FlyerInput): FlyerRow[] {
  const family = new Map(families.map((f) => [f.id, f]));
  const rows = Object.fromEntries(
    FLYER_CODES.map((code) => [code, { code, delivered: delivered[code] ?? 0, scans: scans[code] ?? 0, accounts: 0, started: 0, finished: 0, cardSaved: 0, paying: 0 } satisfies FlyerRow]),
  ) as Record<FlyerCode, FlyerRow>;
  for (const p of parents) {
    const code = flyerOf(p.source);
    const f = family.get(p.id);
    if (!code || !f || (f.test && !withTests)) continue;
    const row = rows[code];
    row.accounts += 1;
    if (f.reached.started) row.started += 1;
    if (f.reached.finished) row.finished += 1;
    if (f.reached.card_saved) row.cardSaved += 1;
    if (f.reached.paying) row.paying += 1;
  }
  return FLYER_CODES.map((c) => rows[c]);
}

/** Per 100 flyers handed out; null until the count is entered. */
export const per100 = (n: number, delivered: number): number | null => (delivered > 0 ? Math.round((n / delivered) * 1000) / 10 : null);

// Standard normal CDF (Abramowitz and Stegun 7.1.26).
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Two-sided p-value that two rates (x1 of n1, x2 of n2) are the same; null when it cannot be told. */
export function twoRatePValue(x1: number, n1: number, x2: number, n2: number): number | null {
  if (n1 <= 0 || n2 <= 0) return null;
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return null;
  return 2 * (1 - normalCdf(Math.abs((x1 / n1 - x2 / n2) / se)));
}

export interface Verdict {
  status: "need-delivered" | "no-signups" | "too-early" | "leaning" | "clear" | "even";
  text: string;
  /** The flyer ahead, when there is one. */
  leader: FlyerCode | null;
}

/** Signups in total before the comparison says anything. Fewer is noise: one more family changes the winner. */
export const MIN_SIGNUPS = 10;

/** What the numbers say about A against B, in words an admin can act on. The measure is signups per flyer handed out. */
export function flyerVerdict(a: FlyerRow, b: FlyerRow): Verdict {
  if (a.delivered <= 0 || b.delivered <= 0) return { status: "need-delivered", leader: null, text: "Enter how many of each flyer you handed out. Without that, the two flyers cannot be compared fairly." };
  const total = a.accounts + b.accounts;
  if (total === 0) return { status: "no-signups", leader: null, text: "No signups from either flyer yet." };
  const ra = a.accounts / a.delivered;
  const rb = b.accounts / b.delivered;
  const leader: FlyerCode | null = ra === rb ? null : ra > rb ? "a" : "b";
  const rates = `Flyer A ${per100(a.accounts, a.delivered)} and Flyer B ${per100(b.accounts, b.delivered)} signups per 100 flyers`;
  if (total < MIN_SIGNUPS) return { status: "too-early", leader, text: `Too early to call: ${total} signups so far, and one more family could change the order. Keep going until there are at least ${MIN_SIGNUPS}. (${rates}.)` };
  const p = twoRatePValue(a.accounts, a.delivered, b.accounts, b.delivered);
  if (p === null || leader === null) return { status: "even", leader: null, text: `No difference yet. (${rates}.)` };
  const name = FLYERS[leader].name;
  if (p < 0.05) return { status: "clear", leader, text: `${name} is ahead, and the gap is unlikely to be luck (p = ${p.toFixed(2)}). ${rates}.` };
  if (p < 0.2) return { status: "leaning", leader, text: `${name} is ahead, but it could still be luck (p = ${p.toFixed(2)}). Keep handing out both. ${rates}.` };
  return { status: "even", leader: null, text: `No clear difference yet (p = ${p.toFixed(2)}). ${rates}.` };
}
