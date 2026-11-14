import Link from "next/link";
import { onboardingCheckInHref, type OnboardingCheckInLoad } from "@/lib/admin-onboarding";
import { adminParentPath } from "@/lib/admin-view";
import { TestTag } from "@/components/admin";

/** Daily personal follow-ups. Opening a draft never sends mail or records a completed contact. */
export function OnboardingCheckIns({ load, isTest }: { load: OnboardingCheckInLoad; isTest: (id: string) => boolean }) {
  if (load.unavailable) return <p role="status">Today&apos;s Day 2 check-ins could not be read. Reload to try again.</p>;
  if (!load.rows.length) return null;
  return <section className="adm-pl-need" aria-labelledby="pl-onboarding">
    <div className="adm-pl-need-head"><h3 id="pl-onboarding">Day 2 check-ins today</h3>
      <span className="adm-pl-count">{load.rows.filter((r) => !isTest(r.parentId)).length}</span>
      <p>Two days after the plan starts, in each family&apos;s local time. Send a personal message to ask how the first day and scanning went. This daily list does not track completed contacts.</p>
    </div>
    <div className="adm-pl-cards">{load.rows.map((r) => <article className="adm-pl-card is-you" key={r.parentId}>
      <h4><Link href={adminParentPath(r.parentId)}>{r.parentName}</Link><TestTag test={isTest(r.parentId)} /></h4>
      <p>How did the first day go? Did scanning work?</p>
      <div className="adm-pl-act"><a className="btn adm-btn ghost" href={onboardingCheckInHref(r)}>Write the check-in email</a></div>
    </article>)}</div>
  </section>;
}
