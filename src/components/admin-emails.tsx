// The Emails page's parts (D-313, D-315): the emails by kind as a compact bar list (sent, clicked, failed), and the
// log of every email, newest first. The Activity log's email views use the same log. Server components only.
import Link from "next/link";
import type { ReactNode } from "react";
import { familyHref, href, TestMark, type Ctx } from "@/components/admin-dashboard-parts";
import { Empty, SectionHead } from "@/components/admin-blocks";
import { DELIVERY_WORDS } from "@/lib/delivery-state";
import {
  EMAIL_KINDS, EMAIL_LABEL, ago, at, clickable, clicksText, countsClicks, deliveryLine, emailFailed, isUnsubscribe,
  type Dashboard, type EmailEvent, type EmailKind,
} from "@/lib/admin-dashboard";
import { emailBars } from "@/lib/admin-pages";
import { adminEmailPath } from "@/lib/admin-view";
import "./admin-pages.css";

const LOG_MAX = 400;
const pl = (n: number, one: string, many: string) => `${n.toLocaleString("en-CA")} ${n === 1 ? one : many}`;

/**
 * Every kind of email that sent something, busiest first: a bar for the emails sent with its clicked part darker, and
 * the failed ones in words. Counts the real families' emails only, over all time.
 */
export function EmailKindBars({ d, ctx }: { d: Dashboard; ctx: Ctx }) {
  const bars = emailBars(d.emailSummary.filter((k) => !isUnsubscribe(k.kind)));
  const offs = d.real.emails.filter((e) => isUnsubscribe(e.kind)).length;
  if (bars.length === 0) return <Empty>No email has gone out yet. Reminders, report emails and Maya emails show here once they send.</Empty>;
  return <>
    <ul className="ap-mail-bars" aria-label="Emails by kind, all time">
      {bars.map((b) => (
        <li key={b.kind}>
          <Link className="ap-mail-kind" href={href(ctx, { kind: b.kind })} prefetch={false}>{b.label}</Link>
          <span className="ap-mail-track" aria-hidden="true"><i style={{ width: `${b.width}%` }}><i style={{ width: `${b.clickedShare}%` }} /></i></span>
          <span className="ap-mail-n">
            <b>{b.sent.toLocaleString("en-CA")} sent</b>
            {countsClicks(b.kind) && <span>{b.clicked} clicked</span>}
            {b.failed > 0 && <span className="is-bad">{b.failed} failed</span>}
            {b.pending > 0 && <span>{b.pending} waiting</span>}
          </span>
        </li>
      ))}
    </ul>
    <p className="ap-mail-key"><span className="ap-mail-sw" aria-hidden="true" /> Sent <span className="ap-mail-sw is-click" aria-hidden="true" /> Clicked{offs > 0 && <> · {pl(offs, "parent turned", "parents turned")} an email off</>}</p>
  </>;
}

/** A sent email's newest delivery event from Resend (D-104), else "Sent". */
function Delivered({ e }: { e: EmailEvent }) {
  const line = deliveryLine(e);
  return line ? <span className={line.bad ? "ap-bad" : undefined}>{line.text}</span> : <>Sent</>;
}

function Result({ e }: { e: EmailEvent }) {
  if (e.status === "failed") return <span className="ap-bad">Failed after {e.attempts} {e.attempts === 1 ? "try" : "tries"}: {e.error ?? "unknown error"}</span>;
  if (e.status === "pending") return <>{DELIVERY_WORDS[e.state]}</>;
  if (e.kind === "unsubscribe") return <>Reminders off</>;
  if (e.kind === "maya_unsubscribe") return <>Maya emails off</>;
  if (e.kind === "monthly_summary_unsubscribe") return <>Monthly summary off</>;
  return <Delivered e={e} />;
}

/** Every logged email, newest first. `nav`: the kind pills, under the heading. */
export function EmailLog({ d, ctx, filter, nav }: { d: Dashboard; ctx: Ctx; filter: EmailKind | "failed" | null; nav?: ReactNode }) {
  const match = (e: EmailEvent) => !filter || (filter === "failed" ? emailFailed(e) : e.kind === filter);
  const rows = d.emails.filter(match);
  // listed only while "Show test families" is on: tag them, and count only the real families' emails
  const testIds = new Set(d.tests.ids);
  const info = filter && filter !== "failed" ? EMAIL_KINDS.find((k) => k.kind === filter) : null;
  return (
    <section aria-labelledby="ap-mail-log">
      <SectionHead id="ap-mail-log" title={filter === "failed" ? "Failed emails" : info ? info.label : "All emails"} count={pl(d.real.emails.filter(match).length, "email", "emails")}
        line={info ? <>Subject: &ldquo;{info.subject}&rdquo;. Goes to: {info.to.toLowerCase()}. Sends when: {info.trigger.toLowerCase()}.</> : "Newest first. Open an email to see it the way the parent got it."} />
      {nav}
      {rows.length === 0 ? <Empty>{filter === "failed" ? "No email failed. Every email reached the parent's mail server." : "No emails here."}</Empty> : (
        <div className="adm-scroll" role="region" aria-label="Emails" tabIndex={0}>
          <table className="adm-table ap-mail-table">
            <thead><tr><th scope="col">Sent (Pacific)</th><th scope="col">Email</th><th scope="col">Family</th><th scope="col">Result</th></tr></thead>
            <tbody>
              {rows.slice(0, LOG_MAX).map((e) => (
                <tr key={e.id} className={emailFailed(e) ? "is-wrong" : undefined}>
                  <td className="adm-nowrap">{at(e.at)}<span className="adm-sub">{ago(e.at, d.now)}</span></td>
                  <td>{isUnsubscribe(e.kind) ? EMAIL_LABEL[e.kind] : <Link href={adminEmailPath(e.id, ctx.demo)}>{EMAIL_LABEL[e.kind]}</Link>}<span className="adm-sub">{isUnsubscribe(e.kind) ? "No email went" : e.subject}</span></td>
                  <td><Link href={familyHref(ctx, e.familyId)}>{e.familyName}</Link><TestMark test={testIds.has(e.familyId)} />{e.childName && <span className="adm-sub">{e.childName}</span>}</td>
                  <td><Result e={e} />{clickable(e) && e.status === "sent" && <span className="adm-sub">{e.clicks ? <>{clicksText(e)}, first {at(e.clicks.first)}</> : "Not clicked yet"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > LOG_MAX && <p className="adm-note ap-foot">Showing the newest {LOG_MAX} emails only.</p>}
      <p className="adm-note ap-foot">Not logged by the site: sign-in codes, sign-in links and password emails.</p>
    </section>
  );
}
