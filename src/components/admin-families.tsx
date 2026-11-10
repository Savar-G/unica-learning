// The Families page's parts (D-313, D-315): the toolbar (search and the Board / List switch), the board of families
// by stage with its slim lanes, and the list. Server components only: no polling, no client state. The model is
// admin-families-board.ts.
import Link from "next/link";
import type { ReactNode } from "react";
import { StageChip, TestMark } from "@/components/admin-dashboard-parts";
import { ago, since, type Family } from "@/lib/admin-dashboard";
import { familiesHref, type Board, type BoardCard, type BoardGroupView } from "@/lib/admin-families-board";
import { adminParentPath, when } from "@/lib/admin-view";
import { gradeShort } from "@/lib/assessment/grades";
import "./admin-families.css";

type Query = Record<string, string | string[] | undefined>;

/** The search and the Board / List switch above the board. */
export function FamiliesToolbar({ path, query, view }: { path: string; query: Query; view: "board" | "list" }) {
  const keep = (k: string) => (typeof query[k] === "string" && query[k] ? (query[k] as string) : null);
  return (
    <div className="fam-tools">
      <form className="fam-search" action={path} method="get" role="search">
        {(["view", "stage", "tests"] as const).map((k) => keep(k) && <input key={k} type="hidden" name={k} value={keep(k)!} />)}
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" name="q" defaultValue={keep("q") ?? ""} placeholder="Search name, email or child" aria-label="Search families" />
      </form>
      <nav className="fam-seg" aria-label="View">
        <Link href={familiesHref(path, query, { view: null, stage: null, page: null })} aria-current={view === "board" ? "page" : undefined} prefetch={false}>Board</Link>
        <Link href={familiesHref(path, query, { view: "list", page: null })} aria-current={view === "list" ? "page" : undefined} prefetch={false}>List</Link>
      </nav>
    </div>
  );
}

function Card({ c }: { c: BoardCard }) {
  const act = c.needs.length > 0;
  return (
    <li className={`fam-card${act ? " is-act" : ""}${c.test ? " is-test" : ""}`}>
      <div className="fam-card-top">
        <span className={`fam-avatar is-h${c.hue}`} aria-hidden="true">{c.initials}</span>
        <div className="fam-who">
          <Link href={adminParentPath(c.id)} prefetch={false} className="fam-name">{c.name}</Link>
          <span className="fam-kids">{c.kids}</span>
        </div>
      </div>
      {act && <p className="fam-need"><span className="adm-sr">Needs you: </span>{c.needs.join(" · ")}</p>}
      <p className="fam-status">{c.status}</p>
      <div className="fam-meta">
        <span className="fam-since">{c.since}</span>
        {c.stageLabel && <span className="fam-stage">{c.stageLabel}</span>}
        {c.isNew && <span className="fam-tag is-new" title="Saved a card in the last 7 days">New</span>}
        {c.live && <span className="fam-tag is-live" title="A child was taking the test when this page loaded"><span className="fam-pulse" aria-hidden="true" />In the test at {c.live}</span>}
        {c.test && <span className="adm-chip is-test" title="A test or team family: left out of every number">test</span>}
      </div>
    </li>
  );
}

function Count({ g }: { g: BoardGroupView }) {
  return <>
    {g.tests > 0 && <span className="fam-plus" aria-hidden="true">+{g.tests} test</span>}
    <span className={`fam-n${g.count ? "" : " is-zero"}`} aria-hidden="true">{g.count}</span>
    <span className="adm-sr">{g.count} {g.count === 1 ? "family" : "families"}{g.tests > 0 ? `, and ${g.tests} test` : ""}</span>
  </>;
}

function ShowAll({ g, path, query }: { g: BoardGroupView; path: string; query: Query }) {
  if (g.total <= g.cards.length) return null;
  return <Link className="fam-all" href={familiesHref(path, query, { view: "list", stage: g.key, page: null })} prefetch={false}>Show all {g.count}{g.tests > 0 ? ` and ${g.tests} test` : ""}</Link>;
}

/** The board: a column per stage group, then the waitlist and cancelled lanes. */
export function FamiliesBoard({ board, path, query }: { board: Board; path: string; query: Query }) {
  return <>
    <div className="fam-board" role="region" aria-label="Families by stage" tabIndex={0}>
      {board.columns.map((g) => (
        <section key={g.key} className="fam-col" aria-labelledby={`fam-col-${g.key}`}>
          <header className="fam-col-head">
            <span className={`fam-tone is-${g.tone}`} aria-hidden="true" />
            <h2 id={`fam-col-${g.key}`}>{g.label}</h2>
            <Count g={g} />
          </header>
          {g.cards.length ? <ul className="fam-cards">{g.cards.map((c) => <Card key={c.id} c={c} />)}</ul> : <p className="fam-empty">{g.empty}</p>}
          <ShowAll g={g} path={path} query={query} />
        </section>
      ))}
    </div>
    {board.lanes.map((g) => (
      <section key={g.key} className="fam-lane" aria-labelledby={`fam-lane-${g.key}`}>
        <h2 id={`fam-lane-${g.key}`} className="fam-lane-head"><span className={`fam-tone is-${g.tone}`} aria-hidden="true" />{g.label}<Count g={g} /></h2>
        {g.cards.length ? (
          <ul>
            {g.cards.map((c) => (
              <li key={c.id} className={c.test ? "is-test" : undefined}>
                <span className={`fam-avatar is-sm is-h${c.hue}`} aria-hidden="true">{c.initials}</span>
                <Link href={adminParentPath(c.id)} prefetch={false}>{c.name}</Link>
                <span className="fam-lane-note">{c.status} {c.since}</span>
                {c.test && <span className="adm-chip is-test">test</span>}
              </li>
            ))}
          </ul>
        ) : <span className="fam-lane-note">{g.empty}</span>}
        <ShowAll g={g} path={path} query={query} />
      </section>
    ))}
  </>;
}

/** The stage filter of the list: every column and lane, with its count of real families. */
export function StageFilter({ board, path, query, current }: { board: Board; path: string; query: Query; current: string | null }) {
  const all = [...board.columns, ...board.lanes];
  const total = all.reduce((n, g) => n + g.count, 0);
  return (
    <nav className="fam-pills" aria-label="Stage">
      <Link href={familiesHref(path, query, { stage: null, page: null })} aria-current={!current ? "true" : undefined} prefetch={false}>Every stage <span>{total}</span></Link>
      {all.map((g) => (
        <Link key={g.key} href={familiesHref(path, query, { stage: g.key, page: null })} aria-current={current === g.key ? "true" : undefined} prefetch={false}>{g.label} <span>{g.count}</span></Link>
      ))}
    </nav>
  );
}

/** The list: the families table, one page of `rows`. */
export function FamiliesList({ rows, now, pager, empty }: { rows: Family[]; now: string; pager: ReactNode; empty: string }) {
  if (rows.length === 0) return <p className="adm-empty">{empty}</p>;
  return <>
    <div className="adm-scroll fam-list" role="region" aria-label="Families" tabIndex={0}>
      <table className="adm-table">
        <thead><tr>{["Parent", "Children", "Stage", "In stage", "Tests", "Joined (Pacific)", "Last activity"].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.id}>
              <td><Link href={adminParentPath(f.id)} prefetch={false}><b>{f.name}</b></Link><TestMark test={f.test} /><span className="adm-sub">{f.email}{f.postal ? ` · ${f.postal}` : ""}</span></td>
              <td>{f.children.map((c) => `${c.name} (gr ${gradeShort(c.grade)}, ${c.province})`).join(", ") || "-"}</td>
              <td><StageChip stage={f.stage} />{f.expired && f.stage === "started" && <span className="adm-sub">Test expired</span>}{f.unsubscribed && <span className="adm-sub">Turned reminders off</span>}</td>
              <td className="adm-nowrap">{since(f.stageAt, now)}</td>
              <td className="adm-num">{f.tests.filter((t) => t.status === "completed").length} of {f.tests.length}</td>
              <td className="adm-nowrap">{when(f.createdAt)}</td>
              <td className="adm-nowrap">{ago(f.lastActivityAt, now)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {pager}
  </>;
}
