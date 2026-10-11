import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { userAgent } from "next/server";
import { bandFor, createSession, type Grade } from "@/lib/assessment";
import type { Child } from "@/lib/account";
import type { AssessmentStatus } from "@/lib/test-api";
import { pageMetadata } from "@/lib/metadata";
import { requirePilot } from "@/lib/pilot";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { TakeTest } from "@/components/test";

export const metadata = pageMetadata({
  path: "/account/test",
  title: "Math test",
  description: "Your child's free math assessment.",
  index: false,
});

// The child's test. The child is read with the parent's own session, so row-level security returns only their children.
export default async function TestPage(props: PageProps<"/account/test/[childId]">) {
  await requirePilot();
  const db = await sessionClient();
  if (!(await parentId(db))) redirect("/sign-in");
  // On a phone the account page asks for a laptop or tablet (D-082).
  if (userAgent({ headers: await headers() }).device.type === "mobile") redirect("/account");

  const { childId } = await props.params;
  const [{ data: child }, { data: last }] = await Promise.all([
    db.from("children").select("id, first_name, grade, province").eq("id", childId).maybeSingle<Child>(),
    db.from("assessments").select("status").eq("child_id", childId).order("created_at", { ascending: false }).limit(1).maybeSingle<{ status: AssessmentStatus }>(),
  ]);
  if (!child) notFound();

  const grade = child.grade as Grade;
  // Grades 1-5 have a bank (grades 3-5 still on the sample bank); grades 6-7 open with theirs (#76).
  let ready = true;
  try {
    createSession({ grade, province: child.province }, 0);
  } catch {
    ready = false;
  }
  return <TakeTest childId={child.id} name={child.first_name} total={bandFor(grade).length} ready={ready} done={last?.status === "completed"} />;
}
