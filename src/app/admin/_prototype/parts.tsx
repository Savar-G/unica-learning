// PROTOTYPE ONLY. Bits every variant uses: links that keep the query, the range tabs and the stage chip.
import Link from "next/link";
import type { ReactNode } from "react";
import { adminParentPath } from "@/lib/admin-view";
import { RANGES, STAGE_SHORT, type Family, type RangeKey, type Stage } from "./data";

export interface Ctx { query: Record<string, string>; demo: boolean }

/** /admin with the current query, changed by `set` (an empty value removes the key). */
export function href(ctx: Ctx, set: Record<string, string | null>): string {
  const q = new URLSearchParams(ctx.query);
  if (!("family" in set)) q.delete("family");
  for (const [k, v] of Object.entries(set)) {
    if (v) q.set(k, v);
    else q.delete(k);
  }
  const s = q.toString();
  return s ? `/admin?${s}` : "/admin";
}

/** Opens the family drawer on the same page; the drawer links to the full parent page. */
export const familyHref = (ctx: Ctx, f: Family) => href(ctx, { family: f.id });
export const parentPage = (ctx: Ctx, f: Family) => (ctx.demo ? null : adminParentPath(f.id));

export function RangeTabs({ ctx, range }: { ctx: Ctx; range: RangeKey }) {
  return (
    <nav className="pa-range" aria-label="Date range">
      {(Object.keys(RANGES) as RangeKey[]).map((k) => (
        <Link key={k} href={href(ctx, { range: k })} aria-current={k === range ? "true" : undefined}>{RANGES[k].label}</Link>
      ))}
    </nav>
  );
}

const STAGE_TONE: Record<Stage, string> = { account: "muted", started: "info", finished: "sun", card_started: "warn", card_saved: "ok", paying: "deep", waitlist: "muted" };
export const StageChip = ({ stage }: { stage: Stage }) => <span className={`pa-stage is-${STAGE_TONE[stage]}`}>{STAGE_SHORT[stage]}</span>;

export function Delta({ value, prev, unit }: { value: number; prev: number | null; unit?: string }) {
  if (prev === null) return null;
  const d = value - prev;
  if (d === 0) return <span className="pa-delta">same as before</span>;
  return <span className={`pa-delta ${d > 0 ? "is-up" : "is-down"}`}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}{unit ?? ""} vs previous</span>;
}

export const Card = ({ title, aside, children, className = "" }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`pa-card ${className}`}>
    {(title || aside) && <header className="pa-card-head">{title && <h2>{title}</h2>}{aside}</header>}
    {children}
  </section>
);
