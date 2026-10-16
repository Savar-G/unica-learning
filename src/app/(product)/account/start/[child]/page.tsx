import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { CURRICULA } from "@/lib/signup";
import type { Child } from "@/lib/account";
import { stateFor } from "@/lib/test-attempt";
import { parentStartStates } from "@/lib/test-attempt-server";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { isPhone } from "@/lib/account-server";
import { isReminderKind } from "@/lib/reminders";
import { startPath } from "@/lib/sign-in-link";
import { StartTest, TrackOnce } from "@/components/account";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/account/start",
  title: "Start the test",
  description: "Your child's free math assessment.",
  index: false,
});

// One child's start screen: the phone-to-laptop sign-in link opens it (#63), so the parent can hand the device over.
// Its button opens the test (#64) at /account/test/<child>.
export default async function StartScreen({ params, searchParams }: PageProps<"/account/start/[child]">) {
  const { child: id } = await params;
  const { via, reminder } = await searchParams;
  // A reminder email (#73) links here: "continue", "come_back" or "start".
  const fromReminder = isReminderKind(reminder) ? reminder : null;
  const db = await sessionClient();
  const parent = await parentId(db);
  // Signed out (a reminder or another device): sign in, then come back to this child's start screen.
  if (!parent) redirect(`/sign-in?next=${encodeURIComponent(`${startPath(id)}${fromReminder ? `?reminder=${fromReminder}` : ""}`)}`);
  // Row-level security returns only this parent's children; an id that is not a uuid finds nothing.
  const [{ data: child }, states] = await Promise.all([
    db.from("children").select("id, first_name, grade, province").eq("id", id).maybeSingle<Child>(),
    parentStartStates(parent, id),
  ]);
  if (!child) notFound();
  // Start, continue, start again after 24 hours, or wait 30 days after a completed test (#72).
  const state = stateFor(states, child.id);
  const phone = isPhone(await headers());

  return (
    <SupportPage label="Free math assessment" title={`${child.first_name}'s math test.`}>
      {via === "link" && <TrackOnce event="sign_in" props={{ channel: "link" }} />}
      {fromReminder && <TrackOnce event="reminder_open" props={{ status: fromReminder }} />}
      <p className="small">Grade {child.grade} · {CURRICULA[child.province]}</p>
      {/* Inside the 30 days after a test there is nothing to start, on any device (#72): the screen gives the date. */}
      {phone && state.kind !== "wait" ? (
        <div className="acct-card acct-phone">
          <TrackOnce event="phone_screen" />
          <h2>Use a laptop or tablet for the test.</h2>
          <p>A phone screen is too small for the test. Go to your account to email yourself a sign-in link for the laptop or tablet.</p>
        </div>
      ) : (
        <>
          {state.kind !== "wait" && <p className="lead">{child.first_name} takes the test alone, on this device, in one sitting. Start when {child.first_name} is ready.</p>}
          <div className="acct-begin"><StartTest childId={child.id} name={child.first_name} state={state} /></div>
        </>
      )}
      <p className="small acct-out"><Link href="/account">Your account</Link></p>
    </SupportPage>
  );
}
