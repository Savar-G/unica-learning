// One logged email the way the parent got it (D-103), laid out like a mail app: the subject, who it is from and to, when,
// what happened to it, then the body. The body is the kept copy (public.email_copies); emails sent before copies were
// kept have none.
import Link from "next/link";
import { EmailFrame } from "@/components/admin-email-frame";
import { familyHref, type Ctx } from "@/components/admin-dashboard-parts";
import { DELIVERY_TEXT, EMAIL_LABEL, at, ago, clickable, clicksText, deliveryProblem, type Delivery, type EmailCopyView, type EmailEvent } from "@/lib/admin-dashboard";

/** What a delivery event means for the parent, in plain words (D-104). */
const DELIVERY_MEANS: Record<Delivery["type"], string> = {
  delivered: "The parent's mail server took it.",
  delivery_delayed: "The parent's mail server did not take it yet. Resend keeps trying.",
  bounced: "The parent's mail server refused it. The address may be wrong or full.",
  complained: "The parent marked it as spam. Resend sends nothing more to this address.",
  failed: "Resend could not send it.",
  suppressed: "Resend did not send it, because this address bounced or marked an email as spam before.",
};

/** "Unica Learning <contact@unicalearning.com>" as a name and an address. */
function splitAddress(from: string): { name: string; address: string | null } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || m[2], address: m[2] } : { name: from, address: null };
}

/** What happened to the email, from the log (the send outcome) and the copy. */
function resultText(e: EmailEvent, copy: EmailCopyView | null): { text: string; bad: boolean } {
  if (e.status === "failed") return { text: `Not sent: Resend refused it after ${e.attempts} ${e.attempts === 1 ? "try" : "tries"}. ${e.error ?? ""}`.trim(), bad: true };
  if (e.status === "pending") {
    return copy?.outcome === "unknown"
      ? { text: `Delivery unknown: Resend did not answer, so the email may have gone. It is not sent again. ${e.error ?? ""}`.trim(), bad: true }
      : { text: "Waiting to send.", bad: false };
  }
  // After the send: Resend's newest delivery event (D-104).
  const last = copy?.events.at(-1) ?? e.delivery;
  if (last) return { text: `${DELIVERY_TEXT[last.type]}. ${DELIVERY_MEANS[last.type]}`, bad: deliveryProblem(last.type) || last.type === "delivery_delayed" };
  return { text: `${e.kind === "alert" ? "Sent to you" : "Sent to the parent"}. Resend took it; no delivery report from Resend yet.`, bad: false };
}

export function EmailView({ e, copy, ctx, back, now }: { e: EmailEvent; copy: EmailCopyView | null; ctx: Ctx; back: string; now: string }) {
  const from = copy?.from ? splitAddress(copy.from) : null;
  const result = resultText(e, copy);
  return (
    <article className="mail">
      <p className="mail-back"><Link href={back}>All emails</Link></p>
      <header className="mail-head">
        <h1>{copy?.subject ?? e.subject}</h1>
        <span className="dash-stage is-muted">{EMAIL_LABEL[e.kind]}</span>
      </header>
      <div className="mail-from">
        <span className="mail-avatar" aria-hidden="true">{(from?.name ?? "U").charAt(0).toUpperCase()}</span>
        <div className="mail-who">
          <p>
            <b>{from?.name ?? "Sender not kept"}</b>
            {from?.address && <span className="dash-muted"> &lt;{from.address}&gt;</span>}
          </p>
          <p className="dash-muted">
            to {copy?.to ?? "-"}
            {copy?.replyTo && <> · reply to {copy.replyTo}</>}
          </p>
        </div>
        <p className="mail-when">{at(e.at)}<span className="dash-sub">{ago(e.at, now)}</span></p>
      </div>
      <p className={`mail-result${result.bad ? " is-bad" : ""}`}>{result.text}</p>
      {copy && copy.events.length > 0 && (
        <ol className="mail-events" aria-label="Delivery events from Resend">
          {copy.events.map((d, i) => (
            <li key={i} className={deliveryProblem(d.type) ? "is-bad" : undefined}>
              <b>{DELIVERY_TEXT[d.type]}</b> · {at(d.at)}{d.detail && <span className="dash-sub">{d.detail}</span>}
            </li>
          ))}
        </ol>
      )}
      {clickable(e) && e.status === "sent" && (
        <p className="mail-clicks">
          {e.clicks ? <><b>{clicksText(e)}</b> · first click {at(e.clicks.first)}</> : "Not clicked yet."}
          <span className="dash-muted"> Counted when the parent opens our page from the email&apos;s button, signed in.</span>
        </p>
      )}
      <p className="dash-muted mail-family">Family: <Link href={familyHref(ctx, e.familyId)}>{e.familyName}</Link>{e.childName && <> · {e.childName}</>}</p>
      {copy ? (
        <>
          {copy.html ? <EmailFrame html={copy.html} title={`Email: ${copy.subject}`} /> : <pre className="mail-text">{copy.text}</pre>}
          {copy.html && (
            <details className="mail-plain">
              <summary>Plain-text version</summary>
              <pre className="mail-text">{copy.text}</pre>
            </details>
          )}
          <p className="dash-foot">Copy kept {at(copy.keptAt)} (Pacific), from the last send attempt. Unsubscribe links show &ldquo;hidden&rdquo; in place of their secret token, so they do not work here.</p>
        </>
      ) : (
        <p className="dash-empty mail-none">No copy of this email. The site keeps a copy of each reminder and report email from the day this view went live. This email went before that, or its copy could not be saved.</p>
      )}
    </article>
  );
}
