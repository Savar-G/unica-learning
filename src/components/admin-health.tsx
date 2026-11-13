import Link from "next/link";
import { Chip, Table, type Tone } from "@/components/admin";
import { SectionHead, Tiles } from "@/components/admin-blocks";
import { ago } from "@/lib/admin-dashboard";
import { MIN_FOR_RATE, type HealthSummary, type HealthTone, type Measure } from "@/lib/admin-health";
import { when } from "@/lib/admin-view";
import "@/components/admin-pages.css";

// What to fix (D-331): the measures as a ranked table. The words are the module's (src/lib/admin-health.ts); this file
// only lays them out. A count and a rate for each window; a rate shows only when at least MIN_FOR_RATE were counted.

const TONE: Record<HealthTone, { chip: Tone; text: string }> = {
  bad: { chip: "bad", text: "Fix now" },
  warn: { chip: "warn", text: "Look" },
  ok: { chip: "ok", text: "Fine" },
  muted: { chip: "muted", text: "No data" },
};

function Window({ text, rate, n }: { text: string; rate: number | null; n: number }) {
  return <>
    <b>{rate === null ? text : `${rate}%`}</b>
    <span className="adm-sub">{rate === null ? (n === 0 ? "none" : "too few to read a rate") : text}</span>
  </>;
}

export function AdminHealth({ measures, summary, now }: { measures: Measure[]; summary: HealthSummary; now: string }) {
  return <>
    <Tiles label="Summary" tiles={[
      { key: "bad", label: "Fix now", value: summary.bad, sub: summary.bad === 1 ? "measure" : "measures", tone: summary.bad ? "bad" : "ok" },
      { key: "warn", label: "Worth a look", value: summary.warn, sub: summary.warn === 1 ? "measure" : "measures", tone: summary.warn ? "warn" : "ok" },
      { key: "oldest", label: "Oldest answer waiting", value: summary.oldestWaiting ? ago(summary.oldestWaiting, now) : "None", sub: summary.oldestWaiting ? "for our team to mark" : "nothing waits", tone: summary.oldestWaiting ? "info" : "ok" },
    ]} />
    <SectionHead id="ah-list" title="Every measure" line={`A rate shows only when ${MIN_FOR_RATE} or more were counted; below that the page shows the counts. Real families only unless the test switch is on.`} />
    <Table label="Failure and quality measures, worst first" head={["Measure", "Last 7 days", "Last 30 days", "When", "List"]} empty="No measures.">
      {measures.map((m) => <tr key={m.key} className={m.tone === "bad" ? "is-wrong" : undefined}>
        <td style={{ minWidth: "15rem" }}>
          <Chip tone={TONE[m.tone].chip}>{TONE[m.tone].text}</Chip> {m.label}
          <span className="adm-sub">{m.why}</span>
        </td>
        <td><Window text={m.text7} rate={m.rate7} n={m.n7} /></td>
        <td><Window text={m.text30} rate={m.rate30} n={m.n30} /></td>
        <td className="adm-nowrap">{m.at && m.n30 > 0 ? <>{ago(m.at, now)}<span className="adm-sub">{m.atLabel}, {when(m.at)}</span></> : "-"}</td>
        <td className="adm-nowrap"><Link href={m.href} prefetch={false}>{m.link}</Link></td>
      </tr>)}
    </Table>
  </>;
}
