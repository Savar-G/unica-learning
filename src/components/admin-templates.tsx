// The admin table per question template (#199): every template by BC grade, with the times shown, the percent correct,
// the median time and the wrong answers chosen. A server component with no JavaScript; the filters are a GET form.
import Link from "next/link";
import { STRAND_NAMES, gradeLabel, type Level } from "@/lib/assessment";
import { ADMIN_TEMPLATES_PATH, type TemplateFilters, type TemplateLine, type TemplateTable, type WrongLine } from "@/lib/admin-templates";
import { GRADES, PROVINCES, duration } from "@/lib/admin-view";
import { CURRICULA } from "@/lib/signup";
import { Table } from "@/components/admin";
import "./admin-templates.css";

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
  if (f.withTests) q.set("tests", "1");
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
      <label className="adm-check"><input type="checkbox" name="tests" value="1" defaultChecked={filters.withTests} /> Count team and test families</label>
      <button type="submit" className="btn adm-btn">Apply</button>
      <Link href={demoHref(action, demo)} className="adm-clear">Clear</Link>
    </form>
  );
}

/** What the numbers count, in one line. */
export function CountedNote({ filters }: { filters: TemplateFilters }) {
  const who = filters.withTests ? "every family, with the team and test families" : "real families only: the team and test families are left out";
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
    <Table label={label} head={["Template", "Strand", "BC standard", "Shown", "Answered", "Correct", "Median time", "Wrong answers chosen"]} empty="No templates.">
      {lines.map((l) => (
        <tr key={l.id} className={l.shown === 0 ? "is-unseen" : undefined}>
          <td><Link className="adm-mono" href={`${l.href}${templateQuery(filters, demo)}`}>{l.id}</Link></td>
          <td>{l.strand ? STRAND_NAMES[l.strand] : "-"}</td>
          <td>{l.standard && l.standardHref ? <Link href={demoHref(l.standardHref, demo)}>{l.standard}</Link> : "-"}</td>
          <td className="adm-num">{l.shown}</td>
          <td className="adm-num">{l.answered}</td>
          <td className="adm-num">{l.percentCorrect === null ? "-" : `${l.percentCorrect}%`}</td>
          <td className="adm-num adm-nowrap">{l.medianMs === null ? "-" : duration(l.medianMs)}</td>
          <td className="adm-wide"><WrongList wrong={l.wrong} more={l.moreWrong} /></td>
        </tr>
      ))}
    </Table>
  );
}

export function TemplateTableView({ table, filters, demo }: { table: TemplateTable; filters: TemplateFilters; demo: boolean }) {
  const lines = table.grades.flatMap((g) => g.lines);
  const seen = lines.filter((l) => l.shown > 0).length;
  return (
    <div className="adm-templates">
      <TemplateFilterForm action={ADMIN_TEMPLATES_PATH} filters={filters} demo={demo} />
      <CountedNote filters={filters} />
      <p className="adm-note">{table.answers} answers. {seen} of {lines.length} templates shown at least once. Each template is under its BC grade.</p>
      <nav className="adm-row" aria-label="Grades">
        {table.grades.map((g) => <a key={g.level} href={`#grade-${g.level}`}>{gradeName(g.level)}</a>)}
        {table.retired.length > 0 && <a href="#retired">Not in the bank</a>}
      </nav>
      {table.grades.map((g) => (
        <section key={g.level} aria-labelledby={`grade-${g.level}`}>
          <h2 id={`grade-${g.level}`}>{gradeName(g.level)}</h2>
          <Rows lines={g.lines} filters={filters} demo={demo} label={`${gradeName(g.level)} templates`} />
        </section>
      ))}
      {table.retired.length > 0 && (
        <section aria-labelledby="retired">
          <h2 id="retired">Not in the bank</h2>
          <p className="adm-note">Answers to templates that are no longer in the question bank.</p>
          <Rows lines={table.retired} filters={filters} demo={demo} label="Templates not in the bank" />
        </section>
      )}
    </div>
  );
}
