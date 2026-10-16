// #189 (spec #181, D-108): the admin's view of how sure a test's result is: the working level and each area with its
// certainty label, the pace, the rushed wrong answers left out of the score, and whether the parent's report shows the
// reliability note. A server component over the stored placement; placements stored before #189 have no labels.
import { REPORTED_STRAND_NAMES, TOO_FAST_MS, UNRELIABLE_FAST_PERCENT, type Certainty, type Placement } from "@/lib/assessment";
import { STATUS_LABEL } from "@/lib/report-view";
import { levelText } from "@/lib/admin-view";
import { Chip, Table } from "@/components/admin";

const CERTAINTY: Record<Certainty, string> = { clear: "Clear", "early-sign": "Early sign" };
const certaintyWord = (c: Certainty | undefined) => (c ? CERTAINTY[c] : "Not recorded (before #189)");

export function ResultCertainty({ placement }: { placement: Placement | null }) {
  if (!placement) return <p className="adm-note">The result is recorded when the test finishes.</p>;
  const pace = placement.pace;
  return <>
    <p>Working level {levelText(placement.workingLevel)}: {certaintyWord(placement.levelCertainty)}.</p>
    <Table label="Areas" head={["Area", "Status", "Right", "How sure"]} empty="No areas scored.">
      {placement.strands.map((s) => <tr key={s.strand}><td>{REPORTED_STRAND_NAMES[s.strand]}</td><td>{STATUS_LABEL[s.status]}</td><td>{s.correct} of {s.total}</td><td>{certaintyWord(s.certainty)}</td></tr>)}
    </Table>
    {pace ? <>
      <p>{pace.veryFast} of {pace.answers} answers under {TOO_FAST_MS / 1000} s. {pace.leftOut.length} wrong {pace.leftOut.length === 1 ? "answer" : "answers"} from runs of very fast answers left out of the score.</p>
      {pace.unreliable
        ? <p><Chip tone="bad">Reliability note</Chip> Over {UNRELIABLE_FAST_PERCENT}% very fast: the report says the result may not be reliable and offers a new test: at once at most once per 30 days, else on the day it opens (D-108).</p>
        : <p className="adm-note">No reliability note (very fast answers at or under {UNRELIABLE_FAST_PERCENT}%).</p>}
    </> : <p className="adm-note">Pace not recorded (before #189).</p>}
  </>;
}
