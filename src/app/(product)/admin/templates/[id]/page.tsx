import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminFrame, Table } from "@/components/admin";
import { CountedNote, TemplateFilterForm, WrongList, demoHref, templateQuery } from "@/components/admin-templates";
import { RecordFacts } from "@/components/admin-records";
import { BANKS, BC_SKILL_MAP, MISCONCEPTIONS, STRAND_NAMES, fillTemplate, type MisconceptionId } from "@/lib/assessment";
import { requireAdmin, templateStats } from "@/lib/admin-store";
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

// One question template (#199): what it asks, its BC standard, sample questions with their coded wrong answers, and
// its numbers across children with every wrong answer chosen. Admins only; ?demo=1 in local development as the table.
export default async function TemplatePage({ params, searchParams }: PageProps<"/admin/templates/[id]">) {
  const id = decodeURIComponent((await params).id);
  const query = await searchParams;
  const filters = parseTemplateFilters(query);
  const demo = query.demo === "1" && process.env.NODE_ENV === "development";
  const admin = demo ? null : await requireAdmin();
  const stats = admin ? await templateStats(admin, filters, id) : countAnswers(demoAnswers(), filters).filter((s) => s.template_id === id);
  const bands = Object.entries(BANKS).filter(([, bank]) => bank.some((t) => t.id === id)).map(([band]) => band);
  const template = Object.values(BANKS).flat().find((t) => t.id === id);
  if (!template && stats.length === 0) notFound();

  const table = templateTable(stats, template ? [template] : []);
  const line = table.grades[0]?.lines[0] ?? table.retired[0];
  const standard = template ? BC_SKILL_MAP.standards.find((s) => s.code === template.standard) : undefined;
  const allWrong = [...(stats[0]?.wrong ?? [])].sort((a, b) => b.count - a.count).map((w) => ({
    ...w, meaning: w.misconception ? (MISCONCEPTIONS[w.misconception as MisconceptionId]?.description ?? null) : null,
  }));
  const otherLevels = template ? Object.entries(template.grades).filter(([p]) => p !== "BC").map(([p, l]) => `${p} ${levelText(l)}`).join(", ") : "";

  return (
    <AdminFrame email={admin?.email ?? "demo data"} section="templates" title={<>Template <span className="adm-mono">{id}</span></>}>
      <p><Link href={`${ADMIN_TEMPLATES_PATH}${templateQuery(filters, demo)}`}>All templates</Link></p>
      {template ? (
        <RecordFacts facts={[
          ["Strand", STRAND_NAMES[template.strand]],
          ["BC standard", <Link key="standard" href={demoHref(skillMapStandardPath(template.standard), demo)}>{template.standard}</Link>],
          ["BC grade", levelText(template.grades.BC)],
          ["Other curricula", otherLevels || "-"],
          ["Answer", template.format === "choice" ? "Choose one" : "Type a number"],
          ["Whiteboard", template.whiteboard ? "May require shown work" : "No"],
          ["Question banks", bands.map((b) => `Grades ${b}`).join(", ")],
        ]} />
      ) : <p className="adm-note">This template is no longer in the question bank. Only its numbers are left.</p>}
      {standard && <p className="adm-lead"><strong>{standard.code}</strong> {standard.text}</p>}

      <h2>Across children</h2>
      <TemplateFilterForm action={adminTemplatePath(id)} filters={filters} demo={demo} />
      <CountedNote filters={filters} />
      <RecordFacts facts={[
        ["Shown", line?.shown ?? 0],
        ["Correct", line?.percentCorrect == null ? "-" : `${line.percentCorrect}%`],
        ["Median time", line?.medianMs == null ? "-" : duration(line.medianMs)],
        ["Wrong answers", allWrong.reduce((n, w) => n + w.count, 0)],
      ]} />
      <h3>Every wrong answer chosen</h3>
      <WrongList wrong={allWrong} />

      {template && <>
        <h2>Sample questions</h2>
        <p className="adm-note">Drawn from the template with fixed seeds. A child gets other numbers.</p>
        <ul className="adm-samples">
          {SAMPLE_SEEDS.map((seed) => {
            const q = fillTemplate(template, seed);
            return (
              <li key={seed}>
                <p>{q.prompt}</p>
                {q.figure && <p className="adm-note">With a bar graph: {q.figure.bars.map((b) => `${b.label} ${b.value}`).join(", ")}</p>}
                {q.choices && <p className="adm-note">Choices: {q.choices.join(" | ")}</p>}
                <p>Right answer: <strong>{q.answer}</strong></p>
                <Table label={`Coded wrong answers, sample ${seed}`} head={["Wrong answer", "Mistake"]} empty="No coded wrong answers.">
                  {q.wrong.map((w) => <tr key={w.value}><td>{w.value}</td><td>{w.misconception}: {MISCONCEPTIONS[w.misconception]?.description ?? ""}</td></tr>)}
                </Table>
              </li>
            );
          })}
        </ul>
      </>}
    </AdminFrame>
  );
}
