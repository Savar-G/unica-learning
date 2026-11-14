"use client";
import Link from "next/link";
import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { REFERRAL_API, REFERRAL_MESSAGES, REFERRAL_OFFER, REFERRAL_SCOPE, type ReferralOverview, type ReferralResult } from "@/lib/referral-contract";
import { browserReferralStorage, keepReferralDraft, referralDraft } from "@/lib/referral-draft";

export interface ReferralEntryHandle { confirm(): Promise<boolean> }
/** The same input serves plan choice and Account. Errors retain the parent's exact text. */
export function ReferralCard({ entryOnly = false, ref }: { entryOnly?: boolean; ref?: Ref<ReferralEntryHandle> }) {
  const [overview, setOverview] = useState<ReferralOverview | null>(null);
  const [input, setInput] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true), [pending, setPending] = useState(false);
  const writing = useRef(false), field = useId();
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) setInput(referralDraft(browserReferralStorage())); });
    void fetch(REFERRAL_API, { cache: "no-store" }).then(async response => {
      const result: ReferralResult = await response.json();
      if (!active) return;
      if (result.ok) {
        setOverview(result.overview);
        if (result.overview.appliedCode || result.overview.benefitApplied) { setInput(""); keepReferralDraft("", browserReferralStorage()); }
      } else setMessage(REFERRAL_MESSAGES[result.error]);
    }).catch(() => { if (active) setMessage(REFERRAL_MESSAGES.unavailable); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function confirm(): Promise<boolean> {
    if (writing.current || loading) return false;
    if (overview?.appliedCode || overview?.benefitApplied) return true;
    if (!input.trim()) return true;
    writing.current = true; setPending(true); setMessage("");
    try {
      const response = await fetch(REFERRAL_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: input }) });
      const result: ReferralResult = await response.json();
      if (result.ok) {
        setOverview(result.overview); setMessage("Referral code confirmed. Your free month stays.");
        keepReferralDraft("", browserReferralStorage()); setInput(""); return true;
      }
      setMessage(REFERRAL_MESSAGES[result.error]); return false;
    } catch { setMessage("We could not confirm the result. Your code stays here. Check again before you continue."); return false; }
    finally { writing.current = false; setPending(false); }
  }
  useImperativeHandle(ref, () => ({ confirm }));
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setMessage("Copied."); }
    catch { setMessage("We could not copy it. Select the code or link and copy it."); }
  }
  return <section className="acct-card acct-saved" aria-label="Family referrals">
    <h2>{entryOnly ? "Have a referral code?" : "Family referrals"}</h2>
    {!entryOnly && <><p>{REFERRAL_OFFER}</p><p>{REFERRAL_SCOPE} <Link href="/terms#referrals">Referral rules</Link>.</p></>}
    {loading && <p role="status">Loading referral details...</p>}
    {!loading && !overview && <p><Link href="/account/referrals">Check referral details again</Link></p>}
    {overview && <>
      {!entryOnly && <>
        <p>Your code: <strong>{overview.code}</strong></p>
        <div className="rpt-plans"><button type="button" className="btn ghost" onClick={() => void copy(overview.code)}>Copy code</button><button type="button" className="btn ghost" onClick={() => void copy(overview.shareUrl)}>Copy link</button></div>
        <p className="small" style={{ overflowWrap: "anywhere" }}>{overview.shareUrl}</p>
        <p>{overview.pendingReferrals} pending referrals. {overview.rewardsEarned} rewards earned. {overview.rewardsRemaining} rewards remaining.</p>
        {overview.rewardsRemaining > 0 ? <p>Your unused rewards wait for eligible paid renewals.</p> : <p>No reward is waiting yet.</p>}
      </>}
      {overview.appliedCode || overview.benefitApplied ? <p role="status">{overview.appliedCode ? `Referral code confirmed: ${overview.appliedCode}.` : "Your family's referral is confirmed."} {overview.benefitApplied !== false ? "Your family gets 50% off one paid month for each enrolled child. Your free month stays." : "Your referral attribution is recorded."}</p>
        : overview.canApply ? <form className="acct-form" aria-busy={pending} onSubmit={e => { e.preventDefault(); void confirm(); }}>
          <div className="fld">
          <label htmlFor={field}>Referral code</label>
          <input id={field} name="referralCode" type="text" autoComplete="off" maxLength={64} value={input} disabled={pending} aria-describedby={`${field}-note`} onChange={e => { setInput(e.target.value); keepReferralDraft(e.target.value, browserReferralStorage()); }} />
          <p id={`${field}-note`} className="small">Confirm a code before your family&apos;s first payment. The code gives 50% off one paid month for each enrolled child.</p>
          </div>
          <div className="rpt-plans"><button className="btn ghost" type="submit" disabled={pending || !input.trim()}>{pending ? "Confirming..." : "Confirm code"}</button>
            {input && <button className="btn ghost" type="button" disabled={pending} onClick={() => { setInput(""); keepReferralDraft("", browserReferralStorage()); setMessage("Pending code removed."); }}>Remove pending code</button>}</div>
        </form> : <p>Referral codes are for families that have not made a payment. You can still share your code and earn rewards.</p>}
    </>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
