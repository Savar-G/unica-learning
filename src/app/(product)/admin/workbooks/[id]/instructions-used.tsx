import { Table } from "@/components/admin";
import { instructionLines, SECTION_LABELS, topicName, type InstructionsTrace } from "@/lib/workbook-instructions";

/** The book instructions a plan was made with, and what each did (plan.instructions). Nothing without instructions. */
export function InstructionsUsed({ trace }: { trace: InstructionsTrace | null | undefined }) {
  if (!trace) return null;
  const lines = instructionLines(trace.instructions);
  return <section aria-labelledby="instructions-used-title">
    <h2 id="instructions-used-title">Book instructions used</h2>
    {lines.length > 0 && <p>{lines.map((l) => `${l.section}: ${l.value}`).join(". ")}.</p>}
    <Table label="Book instructions used" head={["Section", "Instruction", "Result", "Why"]} empty="No instruction changed this plan.">
      {trace.outcomes.map((o, i) => <tr key={`${o.section}-${o.value}-${i}`}>
        <th scope="row">{SECTION_LABELS[o.section]}</th>
        <td>{/^U\d+$/.test(o.value) || o.section === "difficulty" ? o.value : topicName(o.value)}</td>
        <td><span className={`adm-chip ${o.applied ? "is-ok" : "is-warn"}`}>{o.applied ? "Applied" : "Not applied"}</span></td>
        <td>{o.note}</td>
      </tr>)}
    </Table>
  </section>;
}
