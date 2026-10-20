import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { CURRICULA } from "@/lib/signup";
import type { StartState } from "@/lib/assessment";
import { stateFor } from "@/lib/test-attempt";
import { parentStartStates } from "@/lib/test-attempt-server";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { isPhone } from "@/lib/account-server";
import { reportPath } from "@/lib/report-view";
import { fromRow, LEARNING_COLUMNS, learningPath } from "@/lib/learning-style";
import { AddChild, SendLink, SignOut, StartTest, TrackOnce } from "@/components/account";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/account",
  title: "Your account",
  description: "Your children and their free math assessment.",
  index: false,
});

// The parent's children, read with their own session, so row-level security returns only their rows.
// On a phone the test cannot start: the child takes it on a laptop or tablet, and the parent emails themselves a
// one-time sign-in link for that device (D-082, #63). A parent new from Google has no row yet and finishes first.
export default async function Account({ searchParams }: PageProps<"/account">) {
  const db = await sessionClient();
  const parentUser = await parentId(db);
  if (!parentUser) redirect("/sign-in");
  const [{ data: parent }, { data: kids }, states, { data: reports }] = await Promise.all([
    db.from("parents").select("name, email").maybeSingle(),
    db.from("children").select(`id, first_name, grade, province, ${LEARNING_COLUMNS}`).order("created_at"),
    // Start, continue, start again after 24 hours, or wait 30 days after a completed test (#72).
    parentStartStates(parentUser),
    // Reports (#65), oldest first, each with the time its test finished.
    db.from("reports").select("id, child_id, assessment:assessments(completed_at)").order("created_at"),
  ]);
  if (!parent) redirect("/account/finish");
  // While a child waits for the next test, the link opens the report of the test just done (none while it is built).
  // In every other state it opens the child's newest report.
  const testReport = new Map((reports ?? []).map((r) => [`${r.child_id}@${Date.parse(r.assessment?.completed_at ?? "")}`, reportPath(r.id)]));
  const newestReport = new Map((reports ?? []).map((r) => [r.child_id, reportPath(r.id)]));
  const reportFor = (id: string, state: StartState) => (state.kind === "wait" ? testReport.get(`${id}@${state.completedAt}`) : newestReport.get(id));
  const phone = isPhone(await headers());
  const { sent, password, existing } = await searchParams;

  const children = kids ?? [];
  return (
    <SupportPage label="Your account" title={`Hi, ${parent.name.split(" ")[0]}.`}>
      {password === "1" && <p role="status" className="acct-alert acct-saved">Your password is saved.</p>}
      {existing === "1" && <p role="status" className="acct-alert acct-saved">This email already has an account, so the code signed you in. Nothing in your account changed. To add a child, use Add another child.</p>}
      {phone ? (
        <div className="acct-card acct-phone">
          <TrackOnce event="phone_screen" />
          <h2>Use a laptop or tablet for the test.</h2>
          <p>A phone screen is too small for the test. We email you a sign-in link: open it on the laptop or tablet, and it opens your child&apos;s start screen. The link works once and only for 24 hours.</p>
          {sent === "1" && <p role="status" className="acct-sent">We sent the link for {children[0]?.first_name ?? "your child"} to <b>{parent.email}</b>.</p>}
        </div>
      ) : (
        <p className="lead">Your child takes the test alone, on this device, in one sitting. Start when your child is ready.</p>
      )}
      <ul className="acct-kids">
        {children.map((c, i) => (
          <li key={c.id} className="acct-kid">
            <span>
              <b>{c.first_name}</b><span className="small">Grade {c.grade} · {CURRICULA[c.province]}</span>
              {/* #126: after the first report, the parent can answer or change how the child learns. */}
              {newestReport.has(c.id) && <Link className="small acct-learn" href={learningPath(c.id)}>
                {fromRow(c) ? `How ${c.first_name} learns: change answers` : `Tell us how ${c.first_name} learns`}
              </Link>}
            </span>
            {/* Inside the 30 days after a test there is nothing to open on the laptop: the phone shows the date too (#72). */}
            {phone && stateFor(states, c.id).kind !== "wait"
              ? <SendLink childId={c.id} name={c.first_name} sent={sent === "1" && i === 0} />
              : <StartTest childId={c.id} name={c.first_name} state={stateFor(states, c.id)} report={reportFor(c.id, stateFor(states, c.id))} />}
          </li>
        ))}
      </ul>
      <AddChild province={children.at(-1)?.province ?? "BC"} />
      <p className="small acct-out">Signed in. <Link href="/account/password">Add or change your password</Link>. <SignOut /></p>
    </SupportPage>
  );
}
