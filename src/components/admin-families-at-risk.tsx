import Link from "next/link";
import { Chip, Table, TestTag, type Tone } from "@/components/admin";
import { Empty, SectionHead, Tiles } from "@/components/admin-blocks";
import { ago } from "@/lib/admin-dashboard";
import { FEW_FAMILIES, QUIET_BAD_DAYS, QUIET_WARN_DAYS, type RiskFamily, type RiskSummary, type RiskTone } from "@/lib/admin-families-at-risk";
import "@/components/admin-pages.css";

// Families at risk (D-332): the families as a ranked table. The words and the order are the module's
// (src/lib/admin-families-at-risk.ts); this file only lays them out. Every link is a plain link with no prefetch.

const TONE: Record<RiskTone, { chip: Tone; text: string }> = {
  bad: { chip: "bad", text: "At risk" },
  warn: { chip: "warn", text: "Watch" },
  ok: { chip: "ok", text: "Fine" },
};

export function AdminFamiliesAtRisk({ families, summary, now }: { families: RiskFamily[]; summary: RiskSummary; now: string }) {
  if (families.length === 0) {
    return <Empty>No family is on a running plan yet. Families appear here after their free month starts.</Empty>;
  }
  return <>
    <Tiles label="Summary" tiles={[
      { key: "total", label: "On a plan", value: summary.total, sub: summary.total === 1 ? "child" : "children" },
      { key: "bad", label: "At risk", value: summary.bad, sub: "need a call or a fix", tone: summary.bad ? "bad" : "ok" },
      { key: "warn", label: "Watch", value: summary.warn, sub: `quiet ${QUIET_WARN_DAYS}+ days, ending or paused`, tone: summary.warn ? "warn" : "ok" },
      { key: "ok", label: "Fine", value: summary.ok, sub: "active and paid" },
    ]} />
    <SectionHead id="afr-list" title="Every family on a plan" line={`Quiet means no scan, chat or marked page: ${QUIET_WARN_DAYS} days is a watch, ${QUIET_BAD_DAYS} days is at risk. A new plan gets a few days first.${summary.few ? ` With under ${FEW_FAMILIES} families, read each row and not the shares.` : ""}`} />
    <Table label="Families on a plan, most at risk first" head={["Family", "Why", "Last real activity", "Plan", "Next action"]} empty="No families.">
      {families.map((f) => <tr key={f.childId} className={f.tone === "bad" ? "is-wrong" : undefined}>
        <td style={{ minWidth: "11rem" }}>
          <Chip tone={TONE[f.tone].chip}>{TONE[f.tone].text}</Chip>{" "}
          <Link href={f.familyHref} prefetch={false}>{f.parentName}</Link><TestTag test={f.test} />
          <span className="adm-sub">{f.childName}</span>
        </td>
        <td style={{ minWidth: "14rem" }}>{f.reasons.length === 0 ? <span className="adm-sub">Nothing wrong</span> : f.reasons.map((r) => <span key={r.key} className="adm-sub">{r.text}</span>)}</td>
        <td className="adm-nowrap">
          {f.lastActivity ? <>{ago(f.lastActivity.at, now)}<span className="adm-sub">{f.lastActivity.kind}</span></> : <>None yet<span className="adm-sub">{f.quietDays === null ? "New plan" : "No scan, chat or mark"}</span></>}
          {f.lastSignInAt && <span className="adm-sub">Signed in {ago(f.lastSignInAt, now)}</span>}
        </td>
        <td>{f.plan}</td>
        <td style={{ minWidth: "12rem" }}>{f.next ? <>{f.next.text}<span className="adm-sub"><Link href={f.next.href} prefetch={false}>{f.next.link}</Link>{f.next.href !== f.familyHref && <> · <Link href={f.familyHref} prefetch={false}>Family page</Link></>}</span></> : <span className="adm-sub">No action</span>}</td>
      </tr>)}
    </Table>
  </>;
}
