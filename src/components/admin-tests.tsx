// The Tests list and one test's page (D-313, D-315): the summary tiles over the list, the test's header card, the
// Result card with its answer bar, and the compact answers table. Server components with no JavaScript; the live
// progress panel (admin-progress.tsx) is the page's only client part. The counts are in src/lib/admin-tests.ts.
import Link from "next/link";
import type { ReactNode } from "react";
import { helpLikely, storedLevelCertainty, type Certainty, type Placement } from "@/lib/assessment";
import { answerTally, testsHref, type AnswerTally, type TestsSummary } from "@/lib/admin-tests";
import { duration, flagText, helpAnswerText, levelText, type AdminFilters, type AnswerLine } from "@/lib/admin-view";
import type { TestRow } from "@/lib/admin-store";
import { Chip, Table } from "@/components/admin";
import { awayCount, changeCount, readAloudCount } from "@/components/admin-timeline";
import "./admin-tests.css";

const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ---------- the list ----------

/**
 * The summary tiles over the tests list: started, finished, in progress, help likely and low AI confidence, for the
 * current filters. Each tile is a link that sets its filter (or clears it, when it is on). `scope`: the quiet line on
 * what was counted.
 */
export function TestsSummaryTiles({ summary: s, filters: f, action, scope }: { summary: TestsSummary; filters: AdminFilters; action: string; scope: ReactNode }) {
  const tiles: { key: string; n: number; label: string; href: string; on: boolean; tone?: "warn" | "bad" }[] = [
    { key: "all", n: s.started, label: "Tests started", on: !f.status && !f.help && !f.flagged && !f.lowAi,
      href: testsHref(action, f, { status: null, help: false, flagged: false, lowAi: false }) },
    { key: "done", n: s.finished, label: "Finished", on: f.status === "completed", href: testsHref(action, f, { status: f.status === "completed" ? null : "completed" }) },
    { key: "open", n: s.inProgress, label: "In progress", on: f.status === "in_progress", href: testsHref(action, f, { status: f.status === "in_progress" ? null : "in_progress" }) },
    { key: "help", n: s.help, label: "Help likely", on: f.help, tone: "warn", href: testsHref(action, f, { help: !f.help, flagged: false }) },
    { key: "ai", n: s.lowAi, label: "Low AI confidence", on: f.lowAi, tone: "bad", href: testsHref(action, f, { lowAi: !f.lowAi }) },
  ];
  const pct = (n: number) => `${s.started ? (100 * n) / s.started : 0}%`;
  return <section className="tst-sum" aria-labelledby="tst-sum-h">
    <h2 id="tst-sum-h" className="adm-sr">Summary</h2>
    <ul className="tst-tiles">
      {tiles.map((t) => <li key={t.key}>
        <Link className={`tst-tile${t.on ? " is-on" : ""}${t.tone && t.n > 0 ? ` is-${t.tone}` : ""}`} href={t.href} prefetch={false} aria-current={t.on ? "true" : undefined}>
          <span className="tst-tile-n">{t.n}</span>
          <span className="tst-tile-label">{t.label}</span>
          {t.key === "all" && s.started > 0 && <span className="tst-status-bar" role="img" aria-label={`${s.finished} finished, ${s.inProgress} in progress, ${s.expired} expired`}>
            <i className="is-done" style={{ width: pct(s.finished) }} /><i className="is-open" style={{ width: pct(s.inProgress) }} /><i className="is-gone" style={{ width: pct(s.expired) }} />
          </span>}
        </Link>
      </li>)}
    </ul>
    <p className="tst-scope">{scope}</p>
  </section>;
}

// ---------- one test ----------

const CERTAINTY: Record<Certainty, string> = { clear: "Clear", "early-sign": "Early sign" };

/** The test's header card: the child, the family, grade, status, level and the key times. */
export function TestHeaderCard({ facts }: { facts: [string, ReactNode][] }) {
  return <dl className="tst-head-card">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

/** Right, wrong, "I don't know yet" and skipped as one bar with its legend. */
export function AnswerBar({ tally: t }: { tally: AnswerTally }) {
  if (t.total === 0) return <p className="adm-note">No answers yet.</p>;
  const parts = [
    { key: "right", n: t.right, label: "right" },
    { key: "wrong", n: t.wrong, label: t.leftOut ? `wrong (${t.leftOut} left out: rushed)` : "wrong" },
    { key: "unknown", n: t.unknown, label: "I don't know yet" },
    { key: "skipped", n: t.skipped, label: "skipped" },
  ].filter((p) => p.n > 0);
  const label = `${t.total} answers: ${parts.map((p) => `${p.n} ${p.label}`).join(", ")}`;
  return <div className="tst-answers">
    <span className="tst-bar" role="img" aria-label={label}>{parts.map((p) => <i key={p.key} className={`is-${p.key}`} style={{ width: `${(100 * p.n) / t.total}%` }} />)}</span>
    <ul className="tst-legend" aria-hidden="true">{parts.map((p) => <li key={p.key}><span className={`tst-sw is-${p.key}`} /><b>{p.n}</b> {p.label}</li>)}</ul>
  </div>;
}

/**
 * The Result card: the working level, the route and how sure it is, the answer bar, the flags and the child's help
 * answer; then `certainty` (the areas and the pace) below a line.
 */
export function ResultCard({ test: t, lines, numbers, certainty }: {
  test: Pick<TestRow, "status" | "help" | "route" | "flags"> & { placement: Placement | null }; lines: AnswerLine[]; numbers: ReadonlyMap<string, number>; certainty: ReactNode;
}) {
  const p = t.placement;
  const sure = p ? storedLevelCertainty({ confidence: p.confidence, certainty: p.levelCertainty }) : undefined;
  const weak = p ? p.strands.filter((s) => s.status !== "secure").length : 0;
  return <section className="tst-result" aria-labelledby="tst-result-h">
    <div className="tst-result-top">
      <h2 id="tst-result-h">Result</h2>
      {t.flags && helpLikely(t.flags) ? <Chip tone="warn">Help likely</Chip> : t.flags && t.flags.length > 0 ? <Chip tone="muted">{pl(t.flags.length, "flag", "flags")}</Chip> : null}
    </div>
    <div className="tst-result-grid">
      <div className="tst-level">
        {p ? <>
          <span className="tst-big">{levelText(p.workingLevel)}</span>
          <span className="tst-big-label"><b>Working level</b><span>Route {t.route ?? p.route}</span>
            <span>How sure: {sure ? CERTAINTY[sure] : "not recorded for older tests"}</span>
            {p.strands.length > 0 && <span>{pl(p.strands.length, "area", "areas")} scored{weak ? `, ${weak} to work on` : ""}</span>}</span>
        </> : <p className="adm-note">{t.status === "completed" ? "No result stored." : "The result is recorded when the test finishes."}</p>}
      </div>
      <div className="tst-result-side">
        <h3 className="tst-mini">Answers</h3>
        <AnswerBar tally={answerTally(lines)} />
        <h3 className="tst-mini">Flags</h3>
        {t.flags?.length ? <ul className="tst-flags">{t.flags.map((f, i) => <li key={i}>{flagText(f, numbers)}</li>)}</ul>
          : <p className="adm-note">{t.status === "completed" ? "No flags." : "Flags are recorded when the test finishes."}</p>}
        <p className="tst-help">Did anyone help? <b>{helpAnswerText(t.help)}</b></p>
      </div>
    </div>
    {p && <div className="tst-certainty">
      <h3 className="tst-mini">How sure the result is</h3>
      {certainty}
    </div>}
  </section>;
}

/** The answers in a compact table: the question, the child's answer, right or wrong, the time and what the child did.
 * The template, the standard, the level and the time on the server are sub lines. */
export function AnswersTable({ lines, adaptive }: { lines: AnswerLine[]; adaptive: boolean }) {
  return <Table label="Answers" head={["#", "Question", "Answer", "Result", "Time", "Did"]} empty="No answers yet.">
    {lines.map((a) => {
      const did = [changeCount(a) !== "-" && changeCount(a) !== "0" && `${changeCount(a)} changes`,
        readAloudCount(a) !== "-" && readAloudCount(a) !== "0" && `read aloud ${readAloudCount(a)}`,
        awayCount(a) !== "-" && awayCount(a) !== "0" && `away ${awayCount(a)}`].filter(Boolean);
      const recorded = a.timeline.changes !== null || a.timeline.readAloud !== null || a.timeline.away !== null;
      return <tr key={a.number} className={a.correct ? "" : "is-wrong"}>
        <td className="adm-num"><a href={`#question-${a.number}`} aria-label={`Question ${a.number}: as the child saw it`}>{a.number}</a></td>
        <td className="adm-wide">{a.prompt ?? a.questionId}
          <span className="adm-sub">{[a.stage ? `${adaptive ? "Block" : "Stage"} ${a.stage}` : null, a.level === null ? null : `Level ${levelText(a.level)} / ${a.strand}`, a.standard ? `BC ${a.standard}` : null].filter(Boolean).join(" · ")}</span>
          {a.templateId && <span className="adm-sub adm-mono">{a.templateId}</span>}
        </td>
        <td>{a.response || <span className="adm-note">Skipped</span>}{!a.correct && <span className="adm-sub">Right answer: {a.rightAnswer ?? "-"}</span>}</td>
        <td><Chip tone={a.correct ? "ok" : "bad"}>{a.correct ? "Right" : "Wrong"}</Chip>{a.leftOut && <span className="adm-sub">Left out: rushed</span>}{a.misconception && <span className="adm-sub">{a.misconception}</span>}</td>
        <td className="adm-nowrap">{duration(a.timeMs)}{a.tooFast && <span className="adm-sub">Under 3 s</span>}{a.timeline.serverMs !== null && <span className="adm-sub">Server {duration(a.timeline.serverMs)}</span>}</td>
        <td className="adm-nowrap">{did.length ? did.map((d) => <span key={String(d)} className="adm-sub">{d}</span>) : <span className="adm-note">{recorded ? "-" : "Not recorded"}</span>}</td>
      </tr>;
    })}
  </Table>;
}
