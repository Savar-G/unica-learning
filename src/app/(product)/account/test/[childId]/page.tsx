import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { userAgent } from "next/server";
import { bandFor, createSession, readsAloudFirst, type Grade } from "@/lib/assessment";
import { stateFor } from "@/lib/test-attempt";
import { parentStartStates } from "@/lib/test-attempt-server";
import { pageMetadata } from "@/lib/metadata";
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
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) redirect("/sign-in");
  // On a phone the account page asks for a laptop or tablet (D-082).
  if (userAgent({ headers: await headers() }).device.type === "mobile") redirect("/account");

  const { childId } = await props.params;
  const [{ data: child }, states] = await Promise.all([
    db.from("children").select("id, first_name, grade, province").eq("id", childId).maybeSingle(),
    parentStartStates(parent, childId),
  ]);
  if (!child) notFound();
  // #72: an open test continues where it stopped; after one ran out of time the next has new questions.
  const state = stateFor(states, child.id);
  const mode = state.kind === "resume" || state.kind === "finish" ? state.kind : state.kind === "expired" ? "restart" : "new";

  // A check constraint limits grade to 0-9 (0 is Kindergarten, D-156).
  const grade = child.grade as Grade;
  // Every grade has a bank (D-156); a test that cannot be built shows "not ready".
  let ready = true;
  try {
    createSession({ grade, province: child.province }, 0);
  } catch {
    ready = false;
  }
  const band = bandFor(grade);
  // #253: a resume past the break (stage 1 locked) says the child can go back until the end of the test.
  const afterBreak = state.kind === "resume" && state.afterBreak === true;
  // #253: every answer is in and the next step is the part 2 grid: "Check your answers, then press Done checking."
  const checkGrid = state.kind === "finish" && state.checkGrid === true;
  return <TakeTest childId={child.id} name={child.first_name} breakAfter={band.stage1} ready={ready} done={state.kind === "wait"} mode={mode} typing={band.whiteboardTyping} afterBreak={afterBreak} checkGrid={checkGrid} readFirst={readsAloudFirst(grade)} />;
}
