import Link from "next/link";
import type { ReactNode } from "react";
import { AddChild, SignOut } from "@/components/account";
import { FamilyDelete } from "@/components/family-delete";
import { SupportPage } from "@/components/support-page";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import type { CurriculumId } from "@/lib/signup";

function CardNote({ card }: { card: unknown }) {
  if (card === "updated") return <p role="status" className="acct-alert">Your new card is saved. We use it for your plan&apos;s next charge.</p>;
  if (card === "unchanged") return <p role="status" className="acct-alert">Your card did not change.</p>;
  if (card === "unconfirmed") return <p role="status" className="acct-alert">We could not confirm your card update. Try again in a few minutes, or email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>;
  if (card === "failed") return <p role="alert" className="acct-alert">We could not update your card. Try again, or email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>;
  return null;
}

export function ParentAccountSettings({ card, billing, details, hasCard, province }: {
  card: unknown; billing: ReactNode; details: ReactNode; hasCard: boolean; province: CurriculumId;
}) {
  return (
    <SupportPage label="Your account" title="Account">
      <CardNote card={card} />
      {billing}
      <h2>Settings</h2>
      <ul className="pd-links">
        {hasCard && <li><Link href="/account/plan">Manage or cancel plan</Link></li>}
        <li><Link href="/account/password">Add or change your password</Link></li>
        <li><Link href="/account/pin">Set or change your PIN</Link></li>
        <li><Link href="/account/maya-notice">Maya notice</Link></li>
      </ul>
      {details}
      <AddChild province={province} />
      <p className="small acct-out">Signed in. <SignOut /></p>
      <FamilyDelete />
    </SupportPage>
  );
}
