import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { FeedbackForm } from "@/components/feedback-form";
import { SupportPage } from "@/components/support-page";
import { FEEDBACK_PATH, FEEDBACK_SIGN_IN, feedbackProduct, feedbackSource } from "@/lib/feedback";
import { DESK_COOKIE, DESK_HOME, deskGate } from "@/lib/desk";
import { pageMetadata } from "@/lib/metadata";
import { parentId, sessionClient } from "@/lib/supabase-auth";

export const metadata = pageMetadata({ path: FEEDBACK_PATH, title: "Feedback", description: "Send feedback to Unica Learning.", index: false });

export default async function FeedbackPage({ searchParams }: PageProps<"/account/feedback">) {
  const parent = await parentId(await sessionClient());
  if (!parent) redirect(FEEDBACK_SIGN_IN);
  if (deskGate(FEEDBACK_PATH, (await cookies()).get(DESK_COOKIE)?.value, parent) !== "pass") redirect(DESK_HOME);
  const query = await searchParams;
  // No child or workbook read. The optional contextual child's ownership is checked atomically when saving.
  return <SupportPage label="Your account" title="Feedback">
    <p className="lead">Tell us what worked well or what we can improve.</p>
    <FeedbackForm initialProduct={feedbackProduct(query.product) ?? ""} childId={typeof query.child === "string" ? query.child : null} source={feedbackSource(query.from)} />
  </SupportPage>;
}
