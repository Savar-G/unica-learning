import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { ChildNameForm } from "@/components/account-child-name";
import { LearningSummary } from "@/components/learning";
import { gradeLabel } from "@/lib/assessment/grades";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import type { Database } from "@/lib/database";
import { fromRow, LEARNING_COLUMNS, learningPath } from "@/lib/learning-style";
import "./account-child-details.css";

// One section per child on the Account tab (#555): the first name, the school grade, and the learning card. The learning
// card's questions stay on their own page and route (/account/learning/<child>); a grade change goes through support.
// Read with the parent's own session: row-level security returns only their children.
export async function childDetails(db: SupabaseClient<Database>) {
  const { data: kids, error } = await db.from("children").select(`id, first_name, grade, ${LEARNING_COLUMNS}`).order("created_at").order("id");
  if (error || !kids) return <p role="alert" className="acct-alert">We could not load your children&apos;s details. Reload the page.</p>;
  if (!kids.length) return null;
  return (
    <div className="acd">
      <h2>{kids.length > 1 ? "Your children" : "Your child"}</h2>
      {kids.map((kid) => {
        const answers = fromRow(kid);
        return (
          <section key={kid.id} className="acd-child" aria-labelledby={`acd-${kid.id}`}>
            <h3 id={`acd-${kid.id}`}>{kid.first_name}</h3>
            <ChildNameForm childId={kid.id} name={kid.first_name} />
            <p className="small">School grade: {gradeLabel(kid.grade)}. To change {kid.first_name}&apos;s grade, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>. A new grade changes where {kid.first_name}&apos;s workbooks start.</p>
            <h4>How {kid.first_name} learns</h4>
            {answers ? <LearningSummary answers={answers} /> : <p className="small">No answers yet.</p>}
            <p className="small"><Link href={learningPath(kid.id)}>{answers ? `Change how ${kid.first_name} learns` : `Tell us how ${kid.first_name} learns`}</Link></p>
          </section>
        );
      })}
    </div>
  );
}
