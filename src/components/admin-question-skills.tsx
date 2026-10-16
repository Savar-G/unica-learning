// The skills of each question on the admin page for one test (#193): the BC skill map skills its template is tagged
// with, main skill first. A server component with no JavaScript; each skill links to its row in the skill map.
import { BC_SKILL_MAP, templateSkills } from "@/lib/assessment";
import { ADMIN_PATH, type AnswerLine } from "@/lib/admin-view";
import { Chip, Table } from "@/components/admin";

const SKILL_MAP_PATH = `${ADMIN_PATH}/skill-map`;

type Line = Pick<AnswerLine, "number" | "templateId" | "standard" | "correct">;

export function QuestionSkills({ lines }: { lines: readonly Line[] }) {
  return <>
    {BC_SKILL_MAP.status === "draft" && <p className="adm-note"><Chip tone="warn">Draft for review</Chip> AI tagged each question template with the skills of the BC skill map. Reviewers check the tags with the map. A skill from another BC standard shows its standard.</p>}
    <Table label="Skills of each question" head={["#", "Template / BC", "Skills tested", "Result"]} empty="No answers yet.">
      {lines.map((a) => {
        const skills = a.templateId ? templateSkills(a.templateId) : [];
        return <tr key={a.number} className={a.correct ? "" : "is-wrong"}>
          <td><a href={`#question-${a.number}`}>{a.number}</a></td>
          <td><span className="adm-mono">{a.templateId ?? "-"}</span><span className="adm-sub">BC {a.standard ?? "-"}</span></td>
          <td className="adm-wide">{skills.length === 0 ? <span className="adm-note">No skill tag: the template is no longer in the bank.</span> : <ul className="adm-list">
            {skills.map((k) => <li key={k.id}>
              <a href={`${SKILL_MAP_PATH}#skill-${k.id}`}>{k.text}</a>
              <span className="adm-sub adm-mono">{k.id}{k.standard !== a.standard ? ` (from BC ${k.standard})` : ""}</span>
            </li>)}
          </ul>}</td>
          <td>{a.correct ? "Right" : "Wrong"}</td>
        </tr>;
      })}
    </Table>
  </>;
}
