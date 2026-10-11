import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { userAgent } from "next/server";
import { bandFor, createSession, type Grade } from "@/lib/assessment";
import type { Child } from "@/lib/account";
import { startStates, stateFor } from "@/lib/assessment-store";
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
  const parent = await parentId(db);
  if (!parent) redirect("/sign-in");
  // On a phone the account page asks for a laptop or tablet (D-082).
  if (userAgent({ headers: await headers() }).device.type === "mobile") redirect("/account");

  const { childId } = await props.params;
  const [{ data: child }, states] = await Promise.all([
    db.from("children").select("id, first_name, grade, province").eq("id", childId).maybeSingle<Child>(),
    startStates(parent, childId),
  ]);
  if (!child) notFound();
  // #72: an open test continues where it stopped; after one ran out of time the next has new questions.
  const state = stateFor(states, child.id);
  const mode = state.kind === "resume" || state.kind === "finish" ? state.kind : state.kind === "expired" ? "restart" : "new";

  const grade = child.grade as Grade;
  // The sample bank covers grades 3-5; the other bands open with their banks (#74, #76).
  let ready = true;
  try {
    createSession({ grade, province: child.province }, 0);
  } catch {
    ready = false;
  }
  const band = bandFor(grade);
  return <TakeTest childId={child.id} name={child.first_name} total={band.length} breakAfter={band.stage1} ready={ready} done={state.kind === "wait"} mode={mode} typing={band.whiteboardTyping} />;
}
