import { cookies } from "next/headers";
import { SupportPage } from "@/components/support-page";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { FAMILY_DELETED_PATH, PLANS_STOPPED_COOKIE } from "@/lib/family-delete";
import { pageMetadata } from "@/lib/metadata";
import { parentId, sessionClient } from "@/lib/supabase-auth";

export const metadata = pageMetadata({ path: FAMILY_DELETED_PATH, title: "Deleting a family's account", description: "What happens after a family asks to delete its account.", index: false });

/**
 * What this page may say. Only the parent's own delete stops the plans, after it read that none can charge.
 *
 * - A signed-in parent: only their own request row counts: "own" once the plans stopped, "queued" before. No request or a
 *   failed read gets the neutral words, and this browser's cookie is never read for them: it may come from another family's
 *   delete.
 * - Signed out: after their own delete the session has ended, so the cookie is all there is ("browser"). It proves only that
 *   a delete was asked for on this browser in the last day and stopped that family's plans, not who is reading, and not
 *   that the deletion finished, so the words speak of "that family" and a request.
 */
async function deletionState(): Promise<"own" | "queued" | "browser" | null> {
  const db = await sessionClient();
  if (await parentId(db)) {
    const { data, error } = await db.rpc("my_family_deletion_state");
    if (error) console.error("[family-delete] state read failed", error.code);
    if (error) return null;
    // The generated types never say that a function can answer null.
    const state = data as string | null;
    return state === "plans_stopped" ? "own" : state === "queued" ? "queued" : null;
  }
  return (await cookies()).get(PLANS_STOPPED_COOKIE)?.value === "1" ? "browser" : null;
}

const KEPT = "A copy of each test without names stays. It has no names, email, postal code, drawings, typed working or anything written in a parent's own words, and it is not linked to the family. Invoices and payment records stay with our payment provider.";

// Where a parent lands when their family's deletion is queued (#556). It holds no family data. The words are true whether
// the deletion has finished or the daily job finishes it, and never say that a family the reader may not be is deleted.
export default async function FamilyDeleted() {
  const help = <p>Questions? Email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>;
  const state = await deletionState();
  if (state === "browser") {
    return (
      <SupportPage label="" title="A family asked to delete its account on this browser.">
        <p>In the last day, a family asked on this browser to delete its account. We stopped every workbook plan for that family, and that family will get no more charges.</p>
        <p>We are deleting that family&apos;s account, its children&apos;s details, tests, reports, workbooks, page photos and Maya notes. If a step fails, we keep the request and try again.</p>
        <p>{KEPT}</p>
        {help}
      </SupportPage>
    );
  }
  if (state === "own" || state === "queued") {
    return (
      <SupportPage label="" title="Your family's account is being deleted.">
        {state === "own" && <p>We stopped every workbook plan. We will make no more charges.</p>}
        <p>We are deleting your account, your children&apos;s details, tests, reports, workbooks, page photos and Maya notes. If a step fails, we keep your request and try again. Every device signs out by the time the deletion finishes.</p>
        <p>{KEPT}</p>
        {help}
      </SupportPage>
    );
  }
  return (
    <SupportPage label="" title="Deleting a family's account">
      <p>If you asked us to delete your family&apos;s account, we are deleting it. If a step fails, we keep the request and try again.</p>
      {help}
    </SupportPage>
  );
}
