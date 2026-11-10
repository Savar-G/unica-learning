// The admin table per question template (#199; restyled for D-313, D-315): the totals as tiles, then every template
// grouped by BC grade, with a small percent-correct bar, the times shown, the median time and the wrong answers chosen
// most. A server component with no JavaScript; the filters are a GET form.
import Link from "next/link";
import { STRAND_NAMES, gradeLabel, type Level } from "@/lib/assessment";
import { ADMIN_TEMPLATES_PATH, type TemplateFilters, type TemplateLine, type TemplateTable, type WrongLine } from "@/lib/admin-templates";
import { GRADES, PROVINCES, duration } from "@/lib/admin-view";
import { CURRICULA } from "@/lib/signup";
import { Table } from "@/components/admin";
import { PercentBar, SectionHead, Tiles } from "@/components/admin-blocks";
import "./admin-templates.css";
import "./admin-pages.css";

const gradeName = (level: Level) => (level === 0 ? "Kindergarten" : `Grade ${level}`);

/** A link inside the admin area that keeps the local demo (?demo=1) on, before any #anchor. */
export function demoHref(href: string, demo: boolean): string {
  if (!demo) return href;
  const [path, hash] = href.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}demo=1${hash ? `#${hash}` : ""}`;
}

/** The filters of the table as a query string ("" when none is set). */
export function templateQuery(f: TemplateFilters, demo: boolean): string {
  const q = new URLSearchParams();
  if (f.grade !== null) q.set("grade", String(f.grade));
  if (f.province) q.set("province", f.province);
  if (demo) q.set("demo", "1");
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function TemplateFilterForm({ action, filters, demo }: { action: string; filters: TemplateFilters; demo: boolean }) {
  return (
    <form className="adm-filters" action={action} method="get" aria-label="Filters">
      {demo && <input type="hidden" name="demo" value="1" />}
      <label>School grade
        <select name="grade" defaultValue={filters.grade ?? ""}>
          <option value="">Any</option>
          {GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}
        </select>
      </label>
      <label>Curriculum
        <select name="province" defaultValue={filters.province ?? ""}>
          <option value="">Any</option>
          {PROVINCES.map((p) => <option key={p} value={p}>{CURRICULA[p]}</option>)}
        </select>
      </label>
      <button type="submit" className="btn adm-btn">Apply</button>
      <Link href={demoHref(action, demo)} className="adm-clear">Clear</Link>
    </form>
  );
}

/** What the numbers count, in one line. */
export function CountedNote({ filters }: { filters: TemplateFilters }) {
  const who = filters.withTests ? "every family, with the test families (Show test families is on)" : "real families only: the test families are left out";
  const which = [filters.grade !== null ? `school grade ${gradeLabel(filters.grade)}` : null, filters.province ? CURRICULA[filters.province] : null].filter(Boolean).join(", ");
  return <p className="adm-note">Counts {who}{which ? `; ${which}` : ""}. Shown includes served questions without an answer. Correct and median time use answered questions only. Time: the thinking time the browser measured. Older answers count as shown when no serve record exists.</p>;
}

export function WrongList({ wrong, more }: { wrong: readonly WrongLine[]; more?: TemplateLine["moreWrong"] }) {
  if (wrong.length === 0) return <span className="adm-note">-</span>;
  return (
    <ul className="adm-wrong">
      {wrong.map((w) => (
        <li key={`${w.response}\u0000${w.misconception ?? ""}`}>
          <strong>{w.response || "Skipped"}</strong> <span className="adm-count">x{w.count}</span>
          <span className="adm-sub">{w.misconception ? `${w.misconception}${w.meaning ? `: ${w.meaning}` : ""}` : "Not coded"}</span>
        </li>
      ))}
      {more && more.answers > 0 && <li className="adm-note">{more.answers} other wrong {more.answers === 1 ? "answer" : "answers"}, {more.times} {more.times === 1 ? "time" : "times"}</li>}
    </ul>
  );
}

function Rows({ lines, filters, demo, label }: { lines: TemplateLine[]; filters: TemplateFilters; demo: boolean; label: string }) {
  return (
    <Table label={label} head={["Template", "Correct", "Shown", "Median time", "Wrong answers chosen most"]} empty="No templates.">
      {lines.map((l) => (
        <tr key={l.id} className={l.shown === 0 ? "is-unseen" : undefined}>
          <td>
            <Link className="adm-mono" href={`${l.href}${templateQuery(filters, demo)}`}>{l.id}</Link>
            <span className="adm-sub">{l.strand ? STRAND_NAMES[l.strand] : "Not in the bank"}{l.standard && l.standardHref && <> · <Link href={demoHref(l.standardHref, demo)}>{l.standard}</Link></>}</span>
          </td>
          <td><PercentBar percent={l.percentCorrect} label={l.percentCorrect === null ? "Never answered" : `${l.percentCorrect}% correct of ${l.answered} answered`} /></td>
          <td className="adm-nowrap">{l.shown}<span className="adm-sub">{l.answered} answered</span></td>
          <td className="adm-num adm-nowrap">{l.medianMs === null ? "-" : duration(l.medianMs)}</td>
          <td className="adm-wide"><WrongList wrong={l.wrong} more={l.moreWrong} /></td>
        </tr>
      ))}
    </Table>
  );
}

/** One grade's numbers for its section head: templates shown at least once, and the percent correct of all its answers. */
function gradeLine(lines: TemplateLine[]): string {
  const seen = lines.filter((l) => l.shown > 0).length;
  const answered = lines.reduce((n, l) => n + l.answered, 0);
  const correct = lines.reduce((n, l) => n + (l.percentCorrect === null ? 0 : (l.percentCorrect / 100) * l.answered), 0);
  return `${seen} of ${lines.length} shown at least once.${answered > 0 ? ` About ${Math.round((100 * correct) / answered)}% of ${answered} answers correct.` : " No answers yet."}`;
}

export function TemplateTableView({ table, filters, demo }: { table: TemplateTable; filters: TemplateFilters; demo: boolean }) {
  const lines = table.grades.flatMap((g) => g.lines);
  const seen = lines.filter((l) => l.shown > 0).length;
  const unseen = lines.length - seen;
  return (
    <div className="adm-templates">
      <TemplateFilterForm action={ADMIN_TEMPLATES_PATH} filters={filters} demo={demo} />
      <Tiles label="Templates" tiles={[
        { key: "answers", label: "Answers counted", value: table.answers.toLocaleString("en-CA"), sub: filters.withTests ? "With the test families" : "Real families only" },
        { key: "seen", label: "Templates shown", value: `${seen} of ${lines.length}`, sub: "Shown to a child at least once" },
        { key: "unseen", label: "Never shown", value: unseen, sub: unseen ? "Still listed, so gaps show" : "Every template was shown", tone: null },
      ]} />
      <CountedNote filters={filters} />
      <nav className="ap-jump" aria-label="Grades">
        {table.grades.map((g) => <a key={g.level} href={`#grade-${g.level}`}>{gradeName(g.level)}</a>)}
        {table.retired.length > 0 && <a href="#retired">Not in the bank</a>}
      </nav>
      {table.grades.map((g) => (
        <section key={g.level} className="ap-grade" aria-labelledby={`grade-${g.level}`}>
          <SectionHead id={`grade-${g.level}`} title={gradeName(g.level)} count={`${g.lines.length} templates`} line={gradeLine(g.lines)} />
          <Rows lines={g.lines} filters={filters} demo={demo} label={`${gradeName(g.level)} templates`} />
        </section>
      ))}
      {table.retired.length > 0 && (
        <section className="ap-grade" aria-labelledby="retired">
          <SectionHead id="retired" title="Not in the bank" count={`${table.retired.length} templates`} line="Answers to templates that are no longer in the question bank." />
          <Rows lines={table.retired} filters={filters} demo={demo} label="Templates not in the bank" />
        </section>
      )}
    </div>
  );
}
