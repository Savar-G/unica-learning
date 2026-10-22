import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/lib/assessment-store";
import { fromRow, LEARNING_COLUMNS, learningPath } from "@/lib/learning-style";
import { pageMetadata } from "@/lib/metadata";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { LearningStep } from "@/components/learning";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/account/learning",
  title: "How your child learns",
  description: "Tell us how your child likes to learn, for their next book.",
  index: false,
});

// How a child learns (#126), from the account: the same questions as on the report, to answer later or change.
// Read with the parent's own session: row-level security returns only their children, so another family's id finds
// nothing.
export default async function LearningPage({ params }: PageProps<"/account/learning/[child]">) {
  const { child: id } = await params;
  if (!isUuid(id)) notFound();
  const db = await sessionClient();
  if (!(await parentId(db))) redirect(`/sign-in?next=${encodeURIComponent(learningPath(id))}`);
  const { data: child } = await db.from("children").select(`id, first_name, ${LEARNING_COLUMNS}`).eq("id", id).maybeSingle();
  if (!child) notFound();
  return (
    <SupportPage label="Your account" title={`How ${child.first_name} learns.`}>
      <p className="small rpt-back"><Link href="/account">← Your account</Link></p>
      <LearningStep childId={child.id} name={child.first_name} start={fromRow(child)} place="account" />
    </SupportPage>
  );
}
