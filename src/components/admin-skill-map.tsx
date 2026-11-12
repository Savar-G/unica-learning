// The BC skill map for reviewers (#192, #194): every standard by grade and strand, its skills, and what each skill
// needs first. A server component with no JavaScript; each prerequisite links to the row of that skill.
import { STRAND_NAMES, type SkillMap, type Strand } from "@/lib/assessment";
import { Chip, Table } from "@/components/admin";
import { SectionHead, Tiles } from "@/components/admin-blocks";
import { standardAnchor } from "@/lib/admin-templates";
import "./admin-pages.css";

const STRAND_ORDER: readonly Strand[] = ["N", "O", "F", "A", "MG", "DP"];
const gradeName = (grade: number) => (grade === 0 ? "Kindergarten" : `Grade ${grade}`);
const anchor = (id: string) => `skill-${id}`;

export function SkillMapView({ map }: { map: SkillMap }) {
  const skillText = new Map(map.standards.flatMap((s) => s.skills.map((k) => [k.id, k.text] as const)));
  const skillCount = skillText.size;
  const edgeCount = map.standards.reduce((n, s) => n + s.skills.reduce((m, k) => m + k.requires.length, 0), 0);
  const grades = [...new Set(map.standards.map((s) => s.grade))].sort((a, b) => a - b);

  return (
    <div className="adm-skill-map">
      {map.status === "draft" && (
        <p className="ap-standard"><Chip tone="warn">Draft for review</Chip> AI wrote the skills and the prerequisites from the BC elaborations. Reviewers check them before we use them. The text of each standard is the exact BC text.</p>
      )}
      <Tiles label="The map" tiles={[
        { key: "standards", label: "Standards", value: map.standards.length, sub: `Across ${grades.length} grades` },
        { key: "skills", label: "Skills", value: skillCount, sub: "Each standard broken into skills" },
        { key: "links", label: "Prerequisite links", value: edgeCount, sub: "What a skill needs first" },
      ]} />
      <nav className="ap-jump" aria-label="Grades">
        {grades.map((g) => <a key={g} href={`#grade-${g}`}>{gradeName(g)}</a>)}
      </nav>
      {grades.map((g) => (
        <section key={g} className="ap-grade" aria-labelledby={`grade-${g}`}>
          <SectionHead id={`grade-${g}`} title={gradeName(g)} count={`${map.standards.filter((s) => s.grade === g).length} standards`} />
          {STRAND_ORDER.map((strand) => {
            const standards = map.standards.filter((s) => s.grade === g && s.strand === strand);
            if (standards.length === 0) return null;
            return (
              <div key={strand}>
                <h3>{STRAND_NAMES[strand]}</h3>
                <Table label={`${gradeName(g)}, ${STRAND_NAMES[strand]}`} head={["Standard", "Skill", "Needs first"]} empty="No standards.">
                  {standards.flatMap((s) => s.skills.map((k, i) => (
                    <tr key={k.id} id={anchor(k.id)}>
                      {i === 0 && <td rowSpan={s.skills.length} className="adm-wide" id={standardAnchor(s.code)}><strong>{s.code}</strong> {s.text}</td>}
                      <td className="adm-wide">{k.text}<span className="adm-sub adm-mono">{k.id}</span></td>
                      <td className="adm-wide">
                        {k.requires.length === 0 ? <span className="adm-note">Nothing in the map</span> : (
                          <ul>
                            {k.requires.map((r) => <li key={r}><a href={`#${anchor(r)}`}>{skillText.get(r) ?? r}</a><span className="adm-sub adm-mono">{r}</span></li>)}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )))}
                </Table>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
