// One logged email the way the parent got it (D-103): the email in a framed preview (who it is from and to, the subject,
// then the body) with its facts on the side (what happened to it, when, the family and the clicks). The body is the
// kept copy (public.email_copies); emails sent before copies were kept have none.
import Link from "next/link";
import { EmailFrame } from "@/components/admin-email-frame";
import { familyHref, type Ctx } from "@/components/admin-dashboard-parts";
import { DELIVERY_WORDS } from "@/lib/delivery-state";
import { DELIVERY_TEXT, EMAIL_LABEL, at, ago, clickable, clicksText, deliveryProblem, type Delivery, type EmailCopyView, type EmailEvent } from "@/lib/admin-dashboard";
import "./admin-blocks.css";
import "./admin-pages.css";

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
    return e.state === "unknown" || copy?.outcome === "unknown"
      ? { text: `${DELIVERY_WORDS.unknown}. ${e.error ?? ""}`.trim(), bad: true }
      : { text: `${DELIVERY_WORDS[e.state === "claimed" ? "claimed" : "unsent"]}.`, bad: false };
  }
  // After the send: Resend's newest delivery event (D-104).
  const last = copy?.events.at(-1) ?? e.delivery;
  if (last) return { text: `${DELIVERY_TEXT[last.type]}. ${DELIVERY_MEANS[last.type]}`, bad: deliveryProblem(last.type) || last.type === "delivery_delayed" };
  return { text: `${e.kind === "alert" ? "Sent to you" : "Sent to the parent"}. Resend took it; no delivery report from Resend yet.`, bad: false };
}

/** The email in a framed preview (the envelope, then the body as the parent saw it) with its facts on the side. */
export function EmailView({ e, copy, ctx, now }: { e: EmailEvent; copy: EmailCopyView | null; ctx: Ctx; now: string }) {
  const from = copy?.from ? splitAddress(copy.from) : null;
  const result = resultText(e, copy);
  return (
    <div className="ap-mail">
      <section className="ap-mail-preview" aria-label="The email as the parent saw it">
        <div className="ap-mail-env">
          <span className="ap-mail-avatar" aria-hidden="true">{(from?.name ?? "U").charAt(0).toUpperCase()}</span>
          <div>
            <p><b>{from?.name ?? "Sender not kept"}</b>{from?.address && <span className="ap-muted"> &lt;{from.address}&gt;</span>}</p>
            <p className="ap-muted">to {copy?.to ?? "-"}{copy?.replyTo && <> · reply to {copy.replyTo}</>}</p>
            <p className="ap-mail-subject">{copy?.subject ?? e.subject}</p>
          </div>
        </div>
        {copy ? (
          <>
            {copy.html ? <EmailFrame html={copy.html} title={`Email: ${copy.subject}`} /> : <pre className="mail-text">{copy.text}</pre>}
            {copy.html && (
              <details className="mail-plain">
                <summary>Plain-text version</summary>
                <pre className="mail-text">{copy.text}</pre>
              </details>
            )}
          </>
        ) : (
          <p className="ab-empty ap-mail-none">No copy of this email. The site keeps a copy of each reminder and report email from the day this view went live. This email went before that, or its copy could not be saved.</p>
        )}
      </section>
      <aside className="ap-mail-side" aria-label="About this email">
        <p className={`ap-mail-result${result.bad ? " is-bad" : ""}`} role="status">{result.text}</p>
        <dl className="ap-mail-facts">
          <div><dt>Kind</dt><dd>{EMAIL_LABEL[e.kind]}</dd></div>
          <div><dt>Sent (Pacific)</dt><dd>{at(e.at)}<span className="adm-sub">{ago(e.at, now)}</span></dd></div>
          <div><dt>Family</dt><dd><Link href={familyHref(ctx, e.familyId)}>{e.familyName}</Link>{e.childName && <span className="adm-sub">{e.childName}</span>}</dd></div>
          {clickable(e) && e.status === "sent" && (
            <div><dt>Clicks</dt><dd>{e.clicks ? <><b>{clicksText(e)}</b><span className="adm-sub">First click {at(e.clicks.first)}</span></> : "Not clicked yet."}
              <span className="adm-sub">Counted when the parent opens our page from the email&apos;s button, signed in.</span></dd></div>
          )}
          {copy && copy.events.length > 0 && (
            <div><dt>Delivery events</dt><dd>
              <ol className="ap-mail-events" aria-label="Delivery events from Resend">
                {copy.events.map((d, i) => (
                  <li key={i} className={deliveryProblem(d.type) ? "is-bad" : undefined}>
                    <b>{DELIVERY_TEXT[d.type]}</b> · {at(d.at)}{d.detail && <span className="adm-sub">{d.detail}</span>}
                  </li>
                ))}
              </ol>
            </dd></div>
          )}
        </dl>
        {copy && <p className="adm-note">Copy kept {at(copy.keptAt)} (Pacific), from the last send attempt. Unsubscribe links show &ldquo;hidden&rdquo; in place of their secret token, so they do not work here.</p>}
      </aside>
    </div>
  );
}
