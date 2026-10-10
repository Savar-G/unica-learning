import { headers } from "next/headers";
import { userAgent } from "next/server";
import { redirect } from "next/navigation";
import { SITE_URL, pageMetadata } from "@/lib/metadata";
import { requirePilot } from "@/lib/pilot";
import { CURRICULA } from "@/lib/signup";
import type { Child } from "@/lib/account";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { AddChild, PhoneSeen, SignOut, StartTest } from "@/components/account";
import { SupportPage } from "@/components/support-page";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";

export const metadata = pageMetadata({
  path: "/account",
  title: "Your account",
  description: "Your children and their free math assessment.",
  index: false,
});

// The parent's children, read with their own session, so row-level security returns only their rows.
// On a phone the test cannot start: the child takes it on a laptop or tablet (D-082).
export default async function Account() {
  await requirePilot();
  const db = await sessionClient();
  if (!(await parentId(db))) redirect("/sign-in");
  const [{ data: parent }, { data: kids }] = await Promise.all([
    db.from("parents").select("name").maybeSingle<{ name: string }>(),
    db.from("children").select("id, first_name, grade, province").order("created_at").returns<Child[]>(),
  ]);
  const phone = userAgent({ headers: await headers() }).device.type === "mobile";

  if (!parent) {
    return (
      <SupportPage label="Your account" title="We could not find your details.">
        <p className="lead">Sign out and try again. If this keeps happening, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>
        <SignOut />
      </SupportPage>
    );
  }

  const children = kids ?? [];
  return (
    <SupportPage label="Your account" title={`Hi, ${parent.name.split(" ")[0]}.`}>
      {phone ? (
        <div className="acct-card acct-phone">
          <PhoneSeen />
          <h2>Use a laptop or tablet for the test.</h2>
          <p>A phone screen is too small for the test. On a laptop or tablet, go to <b>{new URL(SITE_URL).host}/sign-in</b> and sign in with your email and password. Your child can start there.</p>
        </div>
      ) : (
        <p className="lead">Your child takes the test alone, on this device, in one sitting. Start when your child is ready.</p>
      )}
      <ul className="acct-kids">
        {children.map((c) => (
          <li key={c.id} className="acct-kid">
            <span><b>{c.first_name}</b><span className="small">Grade {c.grade} · {CURRICULA[c.province]}</span></span>
            {!phone && <StartTest name={c.first_name} />}
          </li>
        ))}
      </ul>
      <AddChild province={children.at(-1)?.province ?? "BC"} />
      <p className="small acct-out">Signed in. <SignOut /></p>
    </SupportPage>
  );
}
