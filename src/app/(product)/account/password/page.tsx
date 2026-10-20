import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { NewPassword } from "@/components/account";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/account/password",
  title: "Choose a password",
  description: "Add a password to your account, or change it.",
  index: false,
});

// The password reset link signs the parent in and opens this page (#63). A signed-in parent also opens it from
// "Add or change your password" on /account (D-134), for example after a short phone signup with no password.
export default async function ChoosePassword() {
  if (!(await parentId(await sessionClient()))) redirect("/sign-in/reset?expired=1");
  return (
    <SupportPage label="Your account" title="Choose a password.">
      <NewPassword />
    </SupportPage>
  );
}
