import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { requirePilot } from "@/lib/pilot";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { AccountSignup } from "@/components/account";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/start",
  title: "Start the free assessment",
  description: "Create your account and add your child to start the free math assessment.",
  index: false,
});

// The new signup (D-082): no plan question. Pilot families reach it by direct link until the launch ticket (#82).
export default async function Start() {
  await requirePilot();
  if (await parentId(await sessionClient())) redirect("/account");
  return (
    <SupportPage label="Free math assessment" title="Create your account.">
      <p className="lead">Tell us about you and your child. Then your child can start the test.</p>
      <AccountSignup />
    </SupportPage>
  );
}
