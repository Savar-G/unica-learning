import { cookies } from "next/headers";
import { SupportPage } from "@/components/support-page";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { FAMILY_DELETED_PATH, PLANS_STOPPED_COOKIE } from "@/lib/family-delete";
import { pageMetadata } from "@/lib/metadata";
import { parentId, sessionClient } from "@/lib/supabase-auth";

export const metadata = pageMetadata({ path: FAMILY_DELETED_PATH, title: "Your family's account is being deleted", description: "What happens after a family's account is deleted.", index: false });

/**
 * True only for the parent's own delete, which read that no plan can charge before it wrote the request. A signed-in parent
 * is told by the request row. After their own delete the session has ended, so this browser's cookie says it. An admin's
 * request stops no plan, so anyone else, and any failed read without the cookie, gets the neutral words.
 */
async function plansStopped(): Promise<boolean> {
  const here = (await cookies()).get(PLANS_STOPPED_COOKIE)?.value === "1";
  const db = await sessionClient();
  if (!(await parentId(db))) return here;
  const { data, error } = await db.rpc("my_family_deletion_state");
  if (error) console.error("[family-delete] state read failed", error.code);
  // The generated types never say that a function can answer null.
  const state = error ? null : (data as string | null);
  return state ? state === "plans_stopped" : here;
}

// Where a parent lands when their family's deletion is queued (#556). It holds no family data. The words are true whether
// the deletion has finished or the daily job finishes it.
export default async function FamilyDeleted() {
  const help = <p>Questions? Email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>;
  if (!(await plansStopped())) return <SupportPage label="" title="Your family's account is being deleted.">{help}</SupportPage>;
  return (
    <SupportPage label="" title="Your family's account is being deleted.">
      <p>We stopped every workbook plan. We will make no more charges.</p>
      <p>We are deleting your account, your children&apos;s details, tests, reports, workbooks, page photos and Maya notes. If a step fails, we keep your request and try again. Every device signs out by the time the deletion finishes.</p>
      <p>A copy of each test without names stays. It has no names, email, postal code, drawings, typed working or anything written in your own words, and it is not linked to your family. Invoices and payment records stay with our payment provider.</p>
      {help}
    </SupportPage>
  );
}
