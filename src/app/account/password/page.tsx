import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { NewPassword } from "@/components/account";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/account/password",
  title: "Choose a new password",
  description: "Choose a new password for your account.",
  index: false,
});

// The password reset link signs the parent in and opens this page (#63).
export default async function ChoosePassword() {
  if (!(await parentId(await sessionClient()))) redirect("/sign-in/reset?expired=1");
  return (
    <SupportPage label="Your account" title="Choose a new password.">
      <NewPassword />
    </SupportPage>
  );
}
