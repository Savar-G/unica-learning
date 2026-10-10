import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { userAgent } from "next/server";
import { pageMetadata } from "@/lib/metadata";
import { requirePilot } from "@/lib/pilot";
import { CURRICULA } from "@/lib/signup";
import type { Child } from "@/lib/account";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { StartTest, TrackOnce } from "@/components/account";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/account/start",
  title: "Start the test",
  description: "Your child's free math assessment.",
  index: false,
});

// One child's start screen. The phone-to-laptop sign-in link opens it (#63); the test ticket (#64) builds on it.
export default async function StartScreen({ params }: PageProps<"/account/start/[child]">) {
  await requirePilot();
  const { child: id } = await params;
  const db = await sessionClient();
  if (!(await parentId(db))) redirect("/sign-in");
  // Row-level security returns only this parent's children; an id that is not a uuid finds nothing.
  const { data: child } = await db.from("children").select("id, first_name, grade, province").eq("id", id).maybeSingle<Child>();
  if (!child) notFound();
  const phone = userAgent({ headers: await headers() }).device.type === "mobile";

  return (
    <SupportPage label="Free math assessment" title={`${child.first_name}'s math test.`}>
      <p className="small">Grade {child.grade} · {CURRICULA[child.province]}</p>
      {phone ? (
        <div className="acct-card acct-phone">
          <TrackOnce event="phone_screen" />
          <h2>Use a laptop or tablet for the test.</h2>
          <p>A phone screen is too small for the test. Go to your account to email yourself a sign-in link for the laptop or tablet.</p>
        </div>
      ) : (
        <>
          <p className="lead">{child.first_name} takes the test alone, on this device, in one sitting. Start when {child.first_name} is ready.</p>
          <StartTest name={child.first_name} />
        </>
      )}
      <p className="small acct-out"><Link href="/account">Your account</Link></p>
    </SupportPage>
  );
}
