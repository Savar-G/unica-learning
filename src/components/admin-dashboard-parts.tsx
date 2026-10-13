// The dashboard and activity pages' shared parts (D-099): links that keep the page's query, the range tabs, the
// stage chip and the change against the period before. Server components only.
import Link from "next/link";
import type { ReactNode } from "react";
import { RANGES, STAGE_SHORT, type Dashboard, type RangeKey, type Stage } from "@/lib/admin-dashboard";
import "./admin-dashboard.css";

/** The page's own path and query. `demo`: made-up families in local dev (admin-demo.ts). */
export interface Ctx { path: string; query: Record<string, string>; demo: boolean }

/** The page's address with the query changed by `set` (null removes a key). Any change but `family` closes the family panel. */
export function href(ctx: Ctx, set: Record<string, string | null>): string {
  const q = new URLSearchParams(ctx.query);
  if (!("family" in set)) q.delete("family");
  for (const [k, v] of Object.entries(set)) {
    if (v) q.set(k, v);
    else q.delete(k);
  }
  const s = q.toString();
  return s ? `${ctx.path}?${s}` : ctx.path;
}

/** Opens a family's panel on the same page. */
export const familyHref = (ctx: Ctx, id: string) => href(ctx, { family: id });

export function RangeTabs({ ctx, range }: { ctx: Ctx; range: RangeKey }) {
  return (
    <nav className="dash-range" aria-label="Date range">
      {(Object.keys(RANGES) as RangeKey[]).map((k) => (
        <Link key={k} href={href(ctx, { range: k })} aria-current={k === range ? "true" : undefined}>{RANGES[k].label}</Link>
      ))}
    </nav>
  );
}

const STAGE_TONE: Record<Stage, string> = { account: "muted", started: "info", finished: "sun", card_started: "warn", card_saved: "ok", paying: "deep", cancelled: "bad", waitlist: "muted" };
export const StageChip = ({ stage }: { stage: Stage }) => <span className={`dash-stage is-${STAGE_TONE[stage]}`}>{STAGE_SHORT[stage]}</span>;

export function Delta({ value, prev, unit }: { value: number; prev: number | null; unit?: string }) {
  if (prev === null) return null;
  const d = value - prev;
  if (d === 0) return <span className="dash-delta">same as before</span>;
  return <span className={`dash-delta ${d > 0 ? "is-up" : "is-down"}`}><span aria-hidden="true">{d > 0 ? "▲" : "▼"}</span> {d > 0 ? "up" : "down"} {Math.abs(d)}{unit === "%" ? " points" : ""}</span>;
}

export const Card = ({ title, aside, children, className = "" }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={`dash-card ${className}`}>
    {(title || aside) && <header className="dash-card-head">{title && <h2>{title}</h2>}{aside}</header>}
    {children}
  </section>
);

/** Shown above the numbers: made-up data, the Stripe status, and the team and test families when they are counted. */
export function Notes({ ctx, d }: { ctx: Ctx; d: Dashboard }) {
  const n = d.tests.count;
  const families = `${n} team or test ${n === 1 ? "family" : "families"}`;
  return <>
    {ctx.demo && <p className="dash-note">Demo data: made-up families, not your database. Local development only.</p>}
    {d.stripeNote ? <p className="dash-note">{d.stripeNote}</p> : d.stripeMode && <p className="dash-foot dash-tests">Payments: read from Stripe ({d.stripeMode} mode) just now.{d.cardsFoundInStripe > 0 ? ` ${d.cardsFoundInStripe} saved card${d.cardsFoundInStripe === 1 ? " was" : "s were"} found in Stripe that the site had not recorded; they are counted.` : ""}{d.stripeMode === "test" && !ctx.demo ? " Test mode shows test payments only, not real ones." : ""}</p>}
    {/* test families are always left out; a family page's link (?tests=1) is the only way in, and says so here */}
    {d.tests.shown && n > 0 && (
      <p className="dash-foot dash-tests">
        Counting {families} (marked <span className="dash-test">Test</span>). <Link href={href(ctx, { tests: null })}>Leave them out</Link>
      </p>
    )}
  </>;
}

/** Beside a family's name when team and test families are counted. */
export const TestMark = ({ test }: { test: boolean }) => (test ? <span className="dash-test">Test</span> : null);
