import { redirect } from "next/navigation";
import { goalsNext, goalsPath } from "@/lib/child-goals";
import { childrenNeedingGoals } from "@/lib/child-goals-server";
import { pageMetadata } from "@/lib/metadata";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { ChildGoalsForm } from "@/components/child-goals-form";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/account/goals",
  title: "Your goals for your child",
  description: "Three short questions before the free math assessment.",
  index: false,
});

// Parent goals (D-325): right after signup (and after "Add another child"), before the test, the parent answers three
// select-one questions about each child that has no test yet. `child` picks one child (the start screen and the test
// page send the parent here for that child); without it, the oldest child still to answer. When no child needs the
// answers, the page goes on to `next` (a path on this site; default Parent home). The team reads the answers before
// the results call; no answer goes to analytics.
export default async function GoalsPage({ searchParams }: PageProps<"/account/goals">) {
  const { child, next: rawNext } = await searchParams;
  const next = goalsNext(rawNext);
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) redirect(`/sign-in?next=${encodeURIComponent(goalsPath(next, typeof child === "string" ? child : undefined))}`);

  const waiting = await childrenNeedingGoals(db, parent, typeof child === "string" ? child : undefined);
  const kid = waiting[0];
  if (!kid) redirect(next);
  // After this child: the next child still to answer (several children at once), else `next`.
  const after = typeof child === "string" || waiting.length < 2 ? next : goalsPath(next);

  return (
    <SupportPage label="Free math assessment" title={`Your goals for ${kid.firstName}.`}>
      <p className="lead">Three quick questions before the test. They help us when we go over {kid.firstName}&apos;s report with you.</p>
      {/* keep_up is an older card answer the signup does not offer: ask the goal again. */}
      <ChildGoalsForm key={kid.id} childId={kid.id} name={kid.firstName} start={{ ...kid.answers, goal: kid.answers.goal === "keep_up" ? null : kid.answers.goal }} next={after} />
    </SupportPage>
  );
}
