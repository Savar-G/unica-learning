import Link from "next/link";
import { pageMetadata } from "@/lib/metadata";
import { canResend, hashToken, linkState, type LinkState } from "@/lib/sign-in-link";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";
import { ResendLink, TrackOnce } from "@/components/account";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/sign-in/link",
  title: "Sign in with your link",
  description: "Sign in on a laptop or tablet so your child can start the free math assessment.",
  index: false,
});

// The page the emailed link opens (#63). Opening it changes nothing; the button signs the parent in, so a mail
// scanner that opens links cannot use up the link. A used or expired link offers a new one for the same parent.
export default async function SignInLink({ searchParams }: PageProps<"/sign-in/link">) {
  const { t, error } = await searchParams;
  const token = typeof t === "string" ? t : "";
  const hash = hashToken(token);
  const admin = adminClient();
  const { data: row } = hash && admin
    ? await admin.from("sign_in_links").select("parent_id, created_at, expires_at, used_at, children(first_name)").eq("token_hash", hash).maybeSingle()
    : { data: null };
  // A failed sign-in has already used the link; offer a new one.
  const state: LinkState | "failed" = error === "1" && row ? "failed" : linkState(row);
  const child = row?.children?.first_name ?? "your child";
  const signedInAs = await parentId(await sessionClient());
  const track = <TrackOnce event="sign_in_link_page" props={{ status: state }} />;

  if (state === "valid") {
    return (
      <SupportPage label="Free math assessment" title={`Sign in so ${child} can start.`}>
        {track}
        <p className="lead">This signs you in on this device and opens {child}&apos;s start screen. Use it on the laptop or tablet that {child} will use for the test.</p>
        {signedInAs && signedInAs !== row?.parent_id && <p role="status" className="acct-alert">Another account is signed in on this device. This link signs it out.</p>}
        <form className="acct-form" method="post" action="/api/account/sign-in-link/use">
          <input type="hidden" name="t" value={token} />
          <button className="btn" type="submit">Sign in and open the test <span className="arr">→</span></button>
        </form>
      </SupportPage>
    );
  }

  const text: Record<Exclude<LinkState, "valid"> | "failed", { title: string; lead: string }> = {
    used: { title: "This link was already used.", lead: "Each sign-in link works once. Send a new link to your email." },
    expired: { title: "This link has expired.", lead: "Each sign-in link works for 24 hours. Send a new link to your email." },
    failed: { title: "We could not sign you in.", lead: "Something went wrong on our side. Send a new link to your email and try again." },
    unknown: { title: "This link does not work.", lead: "Check that you opened the full link from the email. You can also sign in with your email and password, or with Google. No password? Sign in with a code from your email." },
  };
  // After 7 days an old link cannot ask for a new one; the parent signs in instead.
  const resend = state !== "unknown" && !!row && canResend(row.created_at);
  return (
    <SupportPage label="Your account" title={text[state].title}>
      {track}
      <p className="lead">{resend || state === "unknown" ? text[state].lead : "This link is too old to send a new one. Sign in with your email and password, or with Google. No password? Sign in with a code from your email."}</p>
      {resend ? <ResendLink token={token} /> : <p><Link className="btn" href="/sign-in">Sign in <span className="arr">→</span></Link></p>}
      {signedInAs && <p className="small acct-out">You are signed in on this device. <Link href="/account">Go to your account</Link></p>}
    </SupportPage>
  );
}
