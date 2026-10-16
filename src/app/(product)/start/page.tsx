import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { AccountSignup } from "@/components/account";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/start",
  title: "Start the free assessment",
  description: "Create your account and add your child to start the free math assessment.",
  index: false,
});

// The signup for the free online math assessment (D-082): no plan question. Every "Take free assessment" link on
// the public site opens it (#82). The parent proves the email with a one-time code before any account data is written.
export default async function Start() {
  if (await parentId(await sessionClient())) redirect("/account");
  return (
    <SupportPage label="Free math assessment" title="Create your account.">
      <p className="lead">Tell us about you and your child. Then your child can start the test.</p>
      <AccountSignup />
    </SupportPage>
  );
}
