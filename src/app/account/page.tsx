import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { requirePilot } from "@/lib/pilot";
import { CURRICULA } from "@/lib/signup";
import type { Child } from "@/lib/account";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { isPhone } from "@/lib/account-server";
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
  await requirePilot();
  const db = await sessionClient();
  if (!(await parentId(db))) redirect("/sign-in");
  const [{ data: parent }, { data: kids }] = await Promise.all([
    db.from("parents").select("name, email").maybeSingle<{ name: string; email: string }>(),
    db.from("children").select("id, first_name, grade, province").order("created_at").returns<Child[]>(),
  ]);
  if (!parent) redirect("/account/finish");
  const phone = isPhone(await headers());
  const { sent, password } = await searchParams;

  const children = kids ?? [];
  return (
    <SupportPage label="Your account" title={`Hi, ${parent.name.split(" ")[0]}.`}>
      {password === "1" && <p role="status" className="acct-alert acct-saved">Your new password is saved.</p>}
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
            <span><b>{c.first_name}</b><span className="small">Grade {c.grade} · {CURRICULA[c.province]}</span></span>
            {phone ? <SendLink childId={c.id} name={c.first_name} sent={sent === "1" && i === 0} /> : <StartTest name={c.first_name} />}
          </li>
        ))}
      </ul>
      <AddChild province={children.at(-1)?.province ?? "BC"} />
      <p className="small acct-out">Signed in. <SignOut /></p>
    </SupportPage>
  );
}
