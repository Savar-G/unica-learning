// The admin Home (D-313, D-315), after the picked prototype (.design/experiments/r-admin-nav/b-pulse.html): four
// panels in the team's order (new customers, workbook production, signups, marking), each with one picture, its top
// items, its one action and "See all", then a "Since yesterday" timeline. The full numbers sit in a closed "All
// numbers" section at the bottom. What each panel shows is worked out in src/lib/admin-home.ts. A server component;
// the prepare button is the only client part. No polling: the page reads once.
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Delta, RangeTabs, familyHref, type Ctx } from "@/components/admin-dashboard-parts";
import { Spark } from "@/components/admin-charts";
import { TestTag } from "@/components/admin";
import { BookAction, StageTrack } from "@/components/admin-production";
import { PrepareWorkbook } from "@/components/prepare-workbook";
import { dayLabel, since, type Dashboard, type Family } from "@/lib/admin-dashboard";
import {
  CHECK_PLAN, PERIOD, changeText, customerAction, customerLine, customersPanel, homeDate, markingPanel, productionPanel, runningView,
  signupsPanel, sinceYesterday, whenShort, type BarColumn, type CustomerAction, type DayColumn, type DotColumn,
} from "@/lib/admin-home";
import type { HomeExtras } from "@/lib/admin-home-load";
import { STAGE_TEXT, faceColor, type Book } from "@/lib/admin-production";
import { ADMIN_PATH, ADMIN_WORKBOOKS_PATH, adminWorkbookRunPath } from "@/lib/admin-view";
import { TESTS_SHOWING_NOTE } from "@/lib/admin-test-families";
import "./admin-home.css";

const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const FAMILIES = `${ADMIN_PATH}/parents`;
const MARKING = `${ADMIN_PATH}/scans`;
const PLANS = `${ADMIN_PATH}/next-steps`;
const ACTIVITY = `${ADMIN_PATH}/activity`;

export function HomeView({ d, ctx, extras }: { d: Dashboard; ctx: Ctx; extras: HomeExtras | null }) {
  return (
    <div className="hm">
      {ctx.demo && <p className="hm-note">Demo data: made-up families, not your database. Local development only. Production and marking are not shown.</p>}
      {d.stripeNote && <p className="hm-note">{d.stripeNote}</p>}
      {d.tests.shown && d.tests.count > 0 && <p className="adm-testbar" role="note"><span className="adm-chip is-test">test</span>{TESTS_SHOWING_NOTE}</p>}
      <header className="hm-head">
        <div className="hm-head-text">
          <p className="eyebrow adm-eyebrow">{homeDate(d.now)}</p>
          <h1>Home</h1>
          <p className="adm-head-lead">How the business is doing today, in the order you check it.</p>
        </div>
        <RangeTabs ctx={ctx} range={d.range} />
      </header>
      <div className="hm-bento">
        <Customers d={d} ctx={ctx} extras={extras} />
        <Production extras={extras} demo={ctx.demo} />
        <Signups d={d} ctx={ctx} />
        <Marking extras={extras} demo={ctx.demo} now={d.now} />
      </div>
      <Timeline d={d} ctx={ctx} />
      <AllNumbers d={d} demo={ctx.demo} />
    </div>
  );
}

function PanelHead({ id, title, href, see }: { id: string; title: string; href: string; see: string }) {
  return <div className="hm-panel-head">
    <h2 className="eyebrow" id={id}>{title}</h2>
    <Link className="hm-see" href={href} prefetch={false} aria-label={see}>See all</Link>
  </div>;
}

function Change({ value, prev, range }: { value: number; prev: number | null; range: Dashboard["range"] }) {
  const c = changeText(value, prev, range);
  if (!c) return null;
  return <span className={`hm-change is-${c.tone}`}>{c.tone !== "same" && <span aria-hidden="true">{c.tone === "up" ? "▲ " : "▼ "}</span>}{c.text}</span>;
}

/** The axis under a 14-day chart: the first day, the middle day, and "This week" over the shaded band. */
function Axis({ cols }: { cols: DayColumn[] }) {
  const week = cols.filter((c) => c.thisWeek).length;
  const start = cols.length - week + 1;
  return <div className="hm-axis" aria-hidden="true">
    <span style={{ gridColumn: "1 / span 4" }}>{dayLabel(cols[0].day)}</span>
    {start > 10 && <span style={{ gridColumn: "7 / span 3" }}>{dayLabel(cols[7].day)}</span>}
    <span className="hm-axis-week" style={{ gridColumn: `${Math.min(start, 12)} / -1` }}>This week</span>
  </div>;
}

/** One dot per event, one column per day. A day with more than the cap shows "+N" above its dots. */
function DotStrip({ cols, label }: { cols: DotColumn[]; label: string }) {
  return <div className="hm-strip">
    <div className="hm-cols" role="img" aria-label={label}>
      {cols.map((c) => <div key={c.day} className={`hm-col${c.thisWeek ? " is-week" : ""}`}>
        {c.n === 0 ? <span className="hm-zero" />
          : <>{Array.from({ length: c.dots }, (_, i) => <span key={i} className="hm-dot" />)}{c.more > 0 && <span className="hm-more">+{c.more}</span>}</>}
      </div>)}
    </div>
    <Axis cols={cols} />
  </div>;
}

/** Labeled bars, one per day; a day with none is a small dot. */
function BarStrip({ cols, label }: { cols: BarColumn[]; label: string }) {
  return <div className="hm-strip">
    <div className="hm-cols is-bars" role="img" aria-label={label}>
      {cols.map((c) => <div key={c.day} className={`hm-col${c.thisWeek ? " is-week" : ""}`}>
        {c.n === 0 ? <span className="hm-zero" /> : <><span className="hm-bar" style={{ height: `${Math.max(8, c.height * 0.7)}%` }} /><span className="hm-bar-n">{c.n}</span></>}
      </div>)}
    </div>
    <Axis cols={cols} />
  </div>;
}

function FamilyFace({ f }: { f: Family }) {
  return <span className={`adm-pd-face is-lg${f.test ? " is-test" : ""}`} style={{ background: faceColor(f.id, f.test) }} aria-hidden="true">{f.name.trim().charAt(0).toUpperCase() || "?"}</span>;
}

function Names({ ctx, families, max = 3 }: { ctx: Ctx; families: Family[]; max?: number }) {
  const shown = families.slice(0, max);
  return <>
    {shown.map((f, i) => <span key={f.id}>{i > 0 && ", "}<Link href={familyHref(ctx, f.id)}>{f.name}</Link></span>)}
    {families.length > max && <> and <Link href={`${ACTIVITY}?view=needs`}>{families.length - max} more</Link></>}
  </>;
}

// 1. New customers

function CustomerAct({ act, runner }: { act: CustomerAction; runner: "mac" | "server" }): ReactNode {
  if (!act) return null;
  if (act.kind === "prepare") return <PrepareWorkbook childId={act.book.childId} child={act.book.child} runner={runner} label="Prepare workbook" />;
  if (act.kind === "prepare-many") return <Link className="btn adm-btn" href={`${ADMIN_WORKBOOKS_PATH}?stage=none`} prefetch={false}>Prepare {act.count} workbooks</Link>;
  return <Link className="btn ghost adm-btn" href={PLANS} prefetch={false}>Plans and delivery</Link>;
}

function Customers({ d, ctx, extras }: { d: Dashboard; ctx: Ctx; extras: HomeExtras | null }) {
  const c = customersPanel(d);
  const week = c.days.filter((x) => x.thisWeek).reduce((n, x) => n + x.n, 0);
  const books = extras?.books ?? null;
  const actionOf = (f: Family): CustomerAction => (ctx.demo ? null : customerAction(f, books, { incomplete: extras?.incomplete, neverStarted: extras?.neverStarted }));
  return <section className="hm-panel hm-cust" aria-labelledby="hm-cust">
    <PanelHead id="hm-cust" title="New customers" href={FAMILIES} see="See all families" />
    <div className="hm-hero">
      <span className="hm-big">{c.count}</span>
      <span className="hm-big-label"><b>{c.count === 1 ? "family" : "families"} saved a first card {PERIOD[d.range].now}</b><Change value={c.count} prev={c.prev} range={d.range} /></span>
      <span className="hm-side"><strong>{c.active}</strong><span>active {c.active === 1 ? "plan" : "plans"}</span><span className="hm-side-sub">free month and paying</span></span>
    </div>
    <div>
      <p className="hm-sub">Cards saved, last 14 days</p>
      <DotStrip cols={c.days} label={`Cards saved each day for the last 14 days: ${c.cards14} in all, ${week} this week. One dot is one card.`} />
    </div>
    {c.newest.length > 0
      ? <ul className="hm-rows" aria-label="Newest customers">
        {c.newest.map((f) => {
          const act = actionOf(f);
          return <li key={f.id} className="hm-row">
            <FamilyFace f={f} />
            <span className="hm-who">
              <span><Link className="hm-name" href={familyHref(ctx, f.id)}>{f.name}</Link><TestTag test={f.test} /></span>
              <span className="hm-row-line">{f.children.map((k) => k.name).join(", ") || "No child yet"} · {customerLine(f, books)}{act?.kind === "check-plan" ? ` ${CHECK_PLAN}` : ""}</span>
            </span>
            <span className="hm-row-end">
              <time dateTime={f.reached.card_saved}>{whenShort(f.reached.card_saved, d.now)}</time>
              <CustomerAct act={act} runner={extras?.runner ?? "mac"} />
            </span>
          </li>;
        })}
      </ul>
      : <p className="hm-empty">No customers yet. A family shows here when it saves a card.</p>}
    {c.failing.length > 0 && <p className="hm-alert"><b>{c.failing.length === 1 ? "A payment is failing" : `${c.failing.length} payments are failing`}:</b> <Names ctx={ctx} families={c.failing} />. The last charge did not go through.</p>}
  </section>;
}

// 2. Workbook production

function Production({ extras, demo }: { extras: HomeExtras | null; demo: boolean }) {
  const head = <PanelHead id="hm-prod" title="Workbook production" href={ADMIN_WORKBOOKS_PATH} see="See all workbooks" />;
  if (!extras?.books) return <section className="hm-panel hm-prod" aria-labelledby="hm-prod">{head}
    <p className="hm-empty">{demo ? "Not shown with demo data." : "Production could not be read just now. Reload the page, or open Production."}</p></section>;
  const books = extras.books;
  const p = productionPanel(books, extras.now, { incomplete: extras.incomplete });
  return <section className="hm-panel hm-prod" aria-labelledby="hm-prod">
    {head}
    <p className="hm-line"><b>{p.line.bold}</b> {p.line.rest}</p>
    <div className="hm-track"><StageTrack books={books} /></div>
    {p.running && <Running book={p.running} others={p.otherRunning} now={extras.now} />}
    {p.next && <div className="hm-next">
      <span className="hm-next-text"><span className="hm-sub">Next</span><b>{p.next.child} · Book {p.next.number}</b><TestTag test={p.next.test} /> <span className="hm-muted">{STAGE_TEXT[p.next.stage]}</span></span>
      <span className="hm-next-act">{p.next.stage === "none" && !p.offerPrepare
        ? <Link className="btn ghost adm-btn" href={ADMIN_WORKBOOKS_PATH} prefetch={false}>Open Production</Link>
        : <BookAction book={p.next} runner={extras.runner} />}</span>
    </div>}
    {p.note && <p className="adm-note" role="status">{p.note}</p>}
  </section>;
}

function Running({ book, others, now }: { book: Book; others: number; now: Date }) {
  const v = runningView(book, now);
  const run = book.run!.run;
  const right = !v ? "Being made" : v.waiting ? "Waiting to start" : v.timeLeft ?? (v.percent !== null ? `${v.percent}% done` : "Started");
  const line = [v && !v.waiting ? v.line.replace(/\.$/, "") : "", others ? `${pl(others, "more book is", "more books are")} being made` : ""].filter(Boolean).join(". ");
  return <div className="hm-run">
    <span className="hm-run-top">
      {v && !v.waiting && !v.warn && <span className="adm-pd-pulse" aria-hidden="true" />}
      <Link href={adminWorkbookRunPath(run.id)} prefetch={false}><b>{book.child} · Book {book.number}</b></Link><TestTag test={book.test} />
      <span className="hm-run-left">{right}</span>
    </span>
    {v && v.percent !== null && <span className="adm-pd-meter" role="progressbar" aria-label={`${book.child}, Book ${book.number}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v.percent}><i style={{ width: `${v.percent}%` }} /></span>}
    {line && <span className="hm-run-sub">{line}.</span>}
    {v?.warn && <span className="adm-pd-warn" role="status">{v.warn}</span>}
  </div>;
}

// 3. Signups

function Signups({ d, ctx }: { d: Dashboard; ctx: Ctx }) {
  const s = signupsPanel(d);
  const first = s.funnel[0]?.n ?? 0;
  const period = PERIOD[d.range].now;
  const today = s.days[s.days.length - 1]?.n ?? 0;
  return <section className="hm-panel hm-sign" aria-labelledby="hm-sign">
    <PanelHead id="hm-sign" title="Signups" href={FAMILIES} see="See all families" />
    <div className="hm-sign-grid">
      <div className="hm-stack">
        <div className="hm-hero">
          <span className="hm-big is-sm">{s.count}</span>
          <span className="hm-big-label"><b>{s.count === 1 ? "family" : "families"} signed up {period}</b><Change value={s.count} prev={s.prev} range={d.range} /></span>
        </div>
        <div>
          <p className="hm-sub">Signups, last 14 days</p>
          <BarStrip cols={s.days} label={`Signups each day for the last 14 days: ${s.total14} in all, ${today} today.`} />
        </div>
      </div>
      <div>
        <p className="hm-sub">Where the {pl(first, "family", "families")} who signed up {period} got to</p>
        {first === 0 ? <p className="hm-empty">No one signed up {period}.</p>
          : <ol className="hm-funnel" role="img" aria-label={s.funnel.map((f, i) => `${f.label}: ${f.n}${i ? `, ${f.pct}%` : ""}`).join("; ")}>
            {s.funnel.map((f, i) => <li key={f.stage}>
              <span className="hm-fun-top"><b>{f.label}</b>{i > 0 && <span className="hm-pct">{f.pct}%</span>}<span className="hm-fun-n">{f.n}</span></span>
              <span className="hm-fun-bar"><i className={`is-${i}`} style={{ width: `${f.pct}%` }} /></span>
            </li>)}
          </ol>}
      </div>
    </div>
    {s.nudges.length > 0 && <p className="hm-nudge"><span className="hm-sub">May need a nudge</span>
      {s.nudges.map((n, i) => <span key={n.words}>{i > 0 && " · "}<Names ctx={ctx} families={n.families} /> ({n.words})</span>)}
    </p>}
  </section>;
}

// 4. Marking

function Marking({ extras, demo, now }: { extras: HomeExtras | null; demo: boolean; now: string }) {
  const head = <PanelHead id="hm-mark" title="Marking" href={MARKING} see="See all marking" />;
  if (!extras?.queue) return <section className="hm-panel hm-mark" aria-labelledby="hm-mark">{head}
    <p className="hm-empty">{demo ? "Not shown with demo data." : "The answers waiting for us could not be read just now. Reload the page, or open Marking."}</p></section>;
  const m = markingPanel(extras.queue.items, extras.queue.total, extras.isTest);
  if (m.count === 0) return <section className="hm-panel hm-mark" aria-labelledby="hm-mark">{head}
    <div className="hm-calm">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
      <p><b>No answers wait for us.</b> When the AI is not sure of an answer on a scanned page, it waits here for a person to mark it.</p>
    </div>
  </section>;
  const label = m.reasons.map((r) => `${r.n}: ${r.text.replace(/\.$/, "")}`).join("; ");
  return <section className="hm-panel hm-mark" aria-labelledby="hm-mark">
    {head}
    <div className="hm-queue">
      <div className="hm-queue-top">
        <strong className="hm-qn">{m.count}</strong>
        <span className="hm-queue-text"><b>{m.count === 1 ? "answer waits" : "answers wait"} for us</b>{m.oldest && <span className="hm-muted">Oldest waiting {since(m.oldest, now)}</span>}</span>
        <Link className="btn adm-btn" href={MARKING} prefetch={false}>Mark answers</Link>
      </div>
      {m.sample !== null && (m.reasons.length > 0 || m.books.length > 0) && <p className="hm-sub">Of the oldest {m.sample}</p>}
      {m.reasons.length > 0 && <>
        <div className="hm-stackbar" role="img" aria-label={`Why they wait${m.sample !== null ? ` (of the oldest ${m.sample})` : ""}: ${label}`}>{m.reasons.map((r, i) => <i key={r.text} className={`is-${i % 4}`} style={{ flex: r.n }} />)}</div>
        <ul className="hm-legend">{m.reasons.map((r, i) => <li key={r.text}><span className={`hm-sw is-${i % 4}`} aria-hidden="true" /><span className="hm-legend-n">{r.n}</span><span>{r.text.replace(/\.$/, "")}</span></li>)}</ul>
      </>}
      {m.books.length > 0 && <p className="hm-from">From {m.books.map((b) => `${b.label} (${b.n})`).join(", ")}{m.sample !== null ? ", and more" : ""}.</p>}
    </div>
  </section>;
}

// Since yesterday

function Timeline({ d, ctx }: { d: Dashboard; ctx: Ctx }) {
  const events = sinceYesterday(d);
  const test = new Set(d.families.filter((f) => f.test).map((f) => f.id));
  return <section className="hm-panel hm-today" aria-labelledby="hm-today">
    <PanelHead id="hm-today" title="Since yesterday" href={ACTIVITY} see="See the whole activity log" />
    {events.length === 0 ? <p className="hm-empty">Nothing has happened since yesterday.</p>
      : <ol className="hm-tl" style={{ "--hm-n": events.length } as CSSProperties}>
        {events.map((a, i) => <li key={`${a.kind}-${a.familyId}-${a.at}-${i}`}>
          <time dateTime={a.at}>{whenShort(a.at, d.now)}</time>
          <span className={`hm-k is-${a.kind}`} aria-hidden="true" />
          <span className="hm-tl-text"><Link href={familyHref(ctx, a.familyId)}><b>{a.familyName}</b></Link><TestTag test={test.has(a.familyId)} /> {a.text}</span>
        </li>)}
      </ol>}
  </section>;
}

// All numbers: the full KPI tiles and how they are counted, closed.

function AllNumbers({ d, demo }: { d: Dashboard; demo: boolean }) {
  return <details className="hm-all">
    <summary>All numbers</summary>
    {d.stripeMode && !d.stripeNote && <p className="hm-foot">Payments: read from Stripe ({d.stripeMode} mode) just now.{d.cardsFoundInStripe > 0 ? ` ${d.cardsFoundInStripe} saved card${d.cardsFoundInStripe === 1 ? " was" : "s were"} found in Stripe that the site had not recorded; they are counted.` : ""}{d.stripeMode === "test" && !demo ? " Test mode shows test payments only, not real ones." : ""}</p>}
    <div className="dash-kpis">
      {d.kpis.map((k) => (
        <div key={k.key} className="dash-kpi" title={k.hint}>
          <span className="dash-kpi-label">{k.label}</span>
          <b className="dash-kpi-value">{k.format === "cad" ? `$${k.value.toLocaleString("en-CA", { maximumFractionDigits: 0 })}` : k.value}{k.format === "%" ? "%" : ""}</b>
          {k.prev === null && k.spark.length === 0 ? <span className="dash-delta">right now{k.format === "cad" ? ", CAD" : ""}</span> : <Delta value={k.value} prev={k.prev} unit={k.format === "%" ? "%" : undefined} />}
          <Spark values={k.spark} tone={k.key === "paying" || k.key === "saved" ? "leaf" : "ink"} />
        </div>
      ))}
    </div>
    <div className="dash-how hm-how">
      <h3>How these numbers are counted</h3>
      <dl>
        {d.kpis.map((k) => <div key={k.key}><dt>{k.label}</dt><dd>{k.hint}</dd></div>)}
        <div><dt>New customers</dt><dd>Families whose first card was saved in the range. The dots are cards, one per child, over the last 14 days. Active plans: families in the free month or paying, right now.</dd></div>
        <div><dt>Days and comparisons</dt><dd>Pacific days. Each number is compared with the same number of days just before, cut at the same time of day, so &ldquo;today&rdquo; is compared with yesterday up to this time.</dd></div>
        <div><dt>Stage</dt><dd>The furthest step each family reached, across all its children. Free month: a Stripe subscription in its free trial. Paying: one that is active or past due. Cancelled: it had one, and none is in its free month or paying now. A subscription whose first payment never went through is not counted.</dd></div>
        <div><dt>Funnel</dt><dd>Families who signed up in the range, by the furthest step they reached since. The % is the share of the families who signed up.</dd></div>
        <div><dt>Workbook production and marking</dt><dd>The same books and stages as Production, and the same waiting answers as Marking.</dd></div>
        <div><dt>Left out</dt><dd>Admin accounts and families marked as a test, also while test families show. A deleted family leaves every number, past days included. Signups from before the free test launched (the old reservation form) are not in these numbers.</dd></div>
      </dl>
    </div>
  </details>;
}
