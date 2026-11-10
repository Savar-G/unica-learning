import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminFrame } from "@/components/admin-frame";
import { BarList, Empty, PercentBar, SectionHead, Tiles } from "@/components/admin-blocks";
import { CountedNote, TemplateFilterForm, demoHref, templateQuery } from "@/components/admin-templates";
import { RecordFacts } from "@/components/admin-records";
import { BANKS, BC_SKILL_MAP, MISCONCEPTIONS, STRAND_NAMES, fillTemplate, type MisconceptionId } from "@/lib/assessment";
import { requireAdmin, templateStats } from "@/lib/admin-store";
import { showTestFamilies } from "@/lib/admin-test-families-server";
import {
  ADMIN_TEMPLATES_PATH,
  adminTemplatePath,
  parseTemplateFilters,
  skillMapStandardPath,
  templateStats as countAnswers,
  templateTable,
} from "@/lib/admin-templates";
import { demoAnswers } from "@/lib/admin-templates-demo";
import { duration, levelText } from "@/lib/admin-view";

/** Sample questions drawn from the template, with fixed seeds, so the page shows the same ones each time. */
const SAMPLE_SEEDS = [1, 2, 3];

// One question template (#199; restyled for D-313, D-315): its BC standard, its numbers across children as tiles, every
// wrong answer chosen as a ranked bar list, and sample questions as cards with their coded wrong answers. The template's
// own facts sit in a closed section. Admins only; ?demo=1 in local development as the table.
export default async function TemplatePage({ params, searchParams }: PageProps<"/admin/templates/[id]">) {
  const id = decodeURIComponent((await params).id);
  const query = await searchParams;
  const demo = query.demo === "1" && process.env.NODE_ENV === "development";
  const admin = demo ? null : await requireAdmin();
  // The "Show test families" switch (D-313) decides whether test families count here.
  const filters = { ...parseTemplateFilters(query), withTests: await showTestFamilies() };
  const stats = admin ? await templateStats(admin, filters, id) : countAnswers(demoAnswers(), filters).filter((s) => s.template_id === id);
  const bands = Object.entries(BANKS).filter(([, bank]) => bank.some((t) => t.id === id)).map(([band]) => band);
  const template = Object.values(BANKS).flat().find((t) => t.id === id);
  if (!template && stats.length === 0) notFound();

  const table = templateTable(stats, template ? [template] : []);
  const line = table.grades[0]?.lines[0] ?? table.retired[0];
  const standard = template ? BC_SKILL_MAP.standards.find((s) => s.code === template.standard) : undefined;
  const allWrong = [...(stats[0]?.wrong ?? [])].sort((a, b) => b.count - a.count || a.response.localeCompare(b.response, "en", { numeric: true })).map((w) => ({
    ...w, meaning: w.misconception ? (MISCONCEPTIONS[w.misconception as MisconceptionId]?.description ?? null) : null,
  }));
  const otherLevels = template ? Object.entries(template.grades).filter(([p]) => p !== "BC").map(([p, l]) => `${p} ${levelText(l)}`).join(", ") : "";

  const wrongTotal = allWrong.reduce((n, w) => n + w.count, 0);
  return (
    <AdminFrame email={admin?.email ?? "demo data"} title={<>Template <span className="adm-mono">{id}</span></>}
      lead={template ? `${STRAND_NAMES[template.strand]}, BC grade ${levelText(template.grades.BC)}: how children answer it.` : "No longer in the question bank. Only its numbers are left."}
      actions={<Link className="btn ghost adm-btn" href={`${ADMIN_TEMPLATES_PATH}${templateQuery(filters, demo)}`} prefetch={false}>All templates</Link>}
      testNote={filters.withTests && "Test families are showing, and on this page they are counted in the numbers."}>
      {standard && <p className="ap-standard"><strong>{standard.code}</strong> {standard.text}</p>}

      <SectionHead id="tpl-numbers" title="Across children" line="How often it was shown and how children answered it." />
      <TemplateFilterForm action={adminTemplatePath(id)} filters={filters} demo={demo} />
      <Tiles label="Across children" tiles={[
        { key: "shown", label: "Shown", value: line?.shown ?? 0, sub: `${line?.answered ?? 0} answered` },
        { key: "correct", label: "Correct", value: line?.percentCorrect == null ? "-" : `${line.percentCorrect}%`, sub: <PercentBar percent={line?.percentCorrect ?? null} label="Percent correct" /> },
        { key: "time", label: "Median time", value: line?.medianMs == null ? "-" : duration(line.medianMs), sub: "Thinking time the browser measured" },
        { key: "wrong", label: "Wrong answers", value: wrongTotal, sub: `${allWrong.length} different ${allWrong.length === 1 ? "answer" : "answers"}` },
      ]} />
      <CountedNote filters={filters} />

      <section className="ap-card" aria-labelledby="tpl-wrong">
        <SectionHead id="tpl-wrong" title="Wrong answers, most chosen first" count={wrongTotal ? `${wrongTotal} in all` : undefined} line="Each answer with the mistake it is coded as, when it has one." />
        {allWrong.length === 0 ? <Empty>No wrong answers yet.</Empty> : (
          <BarList label="Wrong answers chosen" bars={allWrong.map((w) => ({
            key: `${w.response}\u0000${w.misconception ?? ""}`,
            label: <b className="adm-mono">{w.response || "Skipped"}</b>,
            sub: w.misconception ? `${w.misconception}${w.meaning ? `: ${w.meaning}` : ""}` : "Not coded",
            value: w.count,
            text: `${w.count}x`,
            tone: w.misconception ? null : "warn",
          }))} />
        )}
      </section>

      {template && <>
        <SectionHead id="tpl-samples" title="Sample questions" line="Drawn from the template with fixed seeds. A child gets other numbers." />
        <ul className="ap-samples">
          {SAMPLE_SEEDS.map((seed) => {
            const q = fillTemplate(template, seed);
            return (
              <li key={seed}>
                <p className="ap-sample-q">{q.prompt}</p>
                {q.figure && <p className="adm-note">With a bar graph: {q.figure.bars.map((b) => `${b.label} ${b.value}`).join(", ")}</p>}
                {q.choices
                  ? <ul className="ap-choices" aria-label="Choices">{q.choices.map((c) => <li key={c} className={String(c) === String(q.answer) ? "is-right" : undefined}>{c}</li>)}</ul>
                  : null}
                <p>Right answer: <strong>{q.answer}</strong></p>
                {q.wrong.length === 0 ? <p className="adm-note">No coded wrong answers.</p> : (
                  <ul className="ap-coded" aria-label={`Coded wrong answers, sample ${seed}`}>
                    {q.wrong.map((w) => <li key={w.value}><b>{w.value}</b><span>{w.misconception}: {MISCONCEPTIONS[w.misconception]?.description ?? ""}</span></li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </>}

      {template && (
        <details className="adm-tech">
          <summary>Template details</summary>
          <RecordFacts facts={[
            ["Strand", STRAND_NAMES[template.strand]],
            ["BC standard", <Link key="standard" href={demoHref(skillMapStandardPath(template.standard), demo)}>{template.standard}</Link>],
            ["BC grade", levelText(template.grades.BC)],
            ["Other curricula", otherLevels || "-"],
            ["Answer", template.format === "choice" ? "Choose one" : "Type a number"],
            ["Whiteboard", template.whiteboard ? "May require shown work" : "No"],
            ["Question banks", bands.map((b) => `Grades ${b}`).join(", ")],
          ]} />
        </details>
      )}
    </AdminFrame>
  );
}
