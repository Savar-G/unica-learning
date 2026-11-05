import { SupportPage } from "@/components/support-page";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { FAMILY_DELETED_PATH } from "@/lib/family-delete";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: FAMILY_DELETED_PATH, title: "Your family's account is being deleted", description: "What happens after you delete your family's account.", index: false });

// Where a parent lands after deleting the family from the Account tab (#556). The session has ended, so the page reads
// nothing and holds no family data. The words are true whether the deletion has finished or the daily job finishes it.
export default function FamilyDeleted() {
  return (
    <SupportPage label="" title="Your family's account is being deleted.">
      <p>We stopped every workbook plan. We will make no more charges.</p>
      <p>We are deleting your account, your children&apos;s details, tests, reports, workbooks, page photos and Maya notes. If a step fails, we keep your request and try again. You are signed out on every device.</p>
      <p>A copy of each test without names stays. It has no names, email, postal code, drawings, typed working or anything written in your own words, and it is not linked to your family. Invoices and payment records stay with our payment provider.</p>
      <p>Questions? Email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>
    </SupportPage>
  );
}
