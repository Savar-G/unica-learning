import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { requirePilot } from "@/lib/pilot";
import { sessionClient } from "@/lib/supabase-auth";
import { FinishAccount } from "@/components/account";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/account/finish",
  title: "Finish your account",
  description: "Tell us about you and your child to start the free math assessment.",
  index: false,
});

// A parent who signed in with Google for the first time has no parent row yet (#63). They give the details Google
// does not: postal code and the child. A parent with a row goes to their account.
export default async function Finish() {
  await requirePilot();
  const db = await sessionClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user?.email) redirect("/sign-in");
  const { data: parent } = await db.from("parents").select("id").maybeSingle();
  if (parent) redirect("/account");
  const meta = user.user_metadata as { full_name?: unknown; name?: unknown };
  const name = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : "";
  return (
    <SupportPage label="Free math assessment" title="Finish your account.">
      <p className="lead">Tell us a little more about you and your child. Then your child can start the test.</p>
      <FinishAccount name={name.slice(0, 120)} email={user.email} />
    </SupportPage>
  );
}
