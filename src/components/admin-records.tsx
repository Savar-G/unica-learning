import Link from "next/link";
import type { ReactNode } from "react";
import type { CardSetupRow, ChildRow, EmailRow, ParentDetail, ParentRow, WaitlistRow } from "@/lib/admin-store";
import { EMAIL_LABEL } from "@/lib/admin-dashboard";
import { stripeCustomerUrl } from "@/lib/stripe";
import { adminParentPath, adminReportPath, adminTestPath, when, type AnswerLine } from "@/lib/admin-view";
import { Chip, Table, TestsTable, gradeAndPlace } from "@/components/admin";

export const childPath = (id: string) => `/admin/children/${id}`;

export function RecordFacts({ facts }: { facts: [string, ReactNode][] }) {
  return <dl className="adm-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "-"}</dd></div>)}</dl>;
}

export function ChildrenTable({ rows }: { rows: ChildRow[] }) {
  return <Table label="Children" head={["Child", "Grade and curriculum", "Added (Pacific)"]} empty="No children.">
    {rows.map((c) => <tr key={c.id}><td><Link href={childPath(c.id)}>{c.first_name}</Link></td><td>{gradeAndPlace(c.grade, c.province)}</td><td>{when(c.created_at)}</td></tr>)}
  </Table>;
}

const EMAIL_STATUS: Record<string, string> = { sent: "Sent", failed: "Failed", claimed: "Sending" };

export function EmailTable({ emails }: { emails: EmailRow[] }) {
  return <Table label="Emails" head={["Created (Pacific)", "Parent", "Child", "Email", "Status", "Attempts", "Sent (Pacific)", "Test", "Error"]} empty="No reminder emails or unsubscribes.">
    {emails.map((e) => <tr key={e.id}><td className="adm-nowrap">{when(e.created_at)}</td><td><Link href={adminParentPath(e.parent_id)}>{e.parent?.name ?? e.parent_id}</Link></td><td>{e.child?.first_name ?? "-"}</td><td>{EMAIL_LABEL[e.kind]}</td><td>{e.status ? (EMAIL_STATUS[e.status] ?? e.status) : "Reminders off"}</td><td>{e.attempts}</td><td className="adm-nowrap">{when(e.sent_at)}</td><td>{e.assessment_id ? <Link href={adminTestPath(e.assessment_id)}>Test</Link> : "-"}</td><td>{e.error ?? "-"}</td></tr>)}
  </Table>;
}

type People = { parent?: ParentRow | null; child?: ChildRow | null };

export function CardsTable({ cards }: { cards: (CardSetupRow & People)[] }) {
  return <Table label="Cards" head={["Updated (Pacific)", "Family", "Child", "Plan", "Monthly price", "Card saved (Pacific)", "Stripe", "Report"]} empty="No card setups.">
    {cards.map((c) => {
      const stripe = c.stripe_customer_id ? stripeCustomerUrl(c.stripe_customer_id) : null;
      return <tr key={c.id}><td className="adm-nowrap">{when(c.updated_at)}</td><td><Link href={adminParentPath(c.parent_id)}>{c.parent?.name ?? "Family"}</Link></td><td><Link href={childPath(c.child_id)}>{c.child?.first_name ?? "Child"}</Link></td><td>{c.plan === "one" ? "Math" : "Math and reading"}</td><td>CAD {c.price}</td><td>{c.card_saved_at ? when(c.card_saved_at) : <Chip tone="warn">Not saved</Chip>}</td><td>{stripe ? <a href={stripe} target="_blank" rel="noopener noreferrer">Open in Stripe</a> : "-"}</td><td>{c.report_id ? <Link href={adminReportPath(c.report_id)}>Report</Link> : "-"}</td></tr>;
    })}
  </Table>;
}

export function WaitlistTable({ waitlist }: { waitlist: (WaitlistRow & People)[] }) {
  return <Table label="Waitlist" head={["Joined (Pacific)", "Family", "Child", "Curriculum", "Report"]} empty="No waitlist entries.">
    {waitlist.map((w) => <tr key={w.id}><td className="adm-nowrap">{when(w.created_at)}</td><td><Link href={adminParentPath(w.parent_id)}>{w.parent?.name ?? "Family"}</Link></td><td><Link href={childPath(w.child_id)}>{w.child?.first_name ?? "Child"}</Link></td><td>{w.province}</td><td>{w.report_id ? <Link href={adminReportPath(w.report_id)}>Report</Link> : "-"}</td></tr>)}
  </Table>;
}

export function FamilyRecords({ family }: { family: ParentDetail }) {
  const people = <T extends { child_id: string }>(r: T) => ({ ...r, parent: family.parent, child: family.children.find((c) => c.id === r.child_id) ?? null });
  return <>
    <h2>Children</h2><ChildrenTable rows={family.children} />
    <h2>Tests</h2><TestsTable tests={family.tests} family />
    <h2>Card setups</h2><CardsTable cards={family.cards.map(people)} />
    <h2>Waitlist</h2><WaitlistTable waitlist={family.waitlist.map(people)} />
    <h2>Emails and unsubscribes</h2><EmailTable emails={family.emails} />
    {/* #78: put the family deletion action here. It must require adminSession again in its server route. */}
  </>;
}

export function ReviewDetail({ review }: { review: AnswerLine["review"] }) {
  if (!review) return <p className="adm-note">No AI review.</p>;
  return <div className="adm-review">
    <div><Chip tone={review.confidence === "low" ? "warn" : "ok"}>{review.confidence} confidence</Chip> <span>Score: {Number(review.score).toFixed(2)}</span></div>
    <p>{review.comment || "No comment."}</p>
    <p className="adm-sub">{review.error_type || "No error type"} · {review.kind} · {review.model}</p>
  </div>;
}
