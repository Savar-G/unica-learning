import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { DESK_HOME } from "@/lib/desk";
import { sessionClient } from "@/lib/supabase-auth";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { ForgotPinForm } from "@/components/desk";
import { DeskShell } from "@/components/desk-shell";

export const metadata = pageMetadata({
  path: `${DESK_HOME}/forgot-pin`,
  title: "Forgot your PIN?",
  description: "Set a new PIN with your account password.",
  index: false,
});

// Forgot PIN (#301): the parent enters their account password and a new PIN; the server checks the password, and the
// desk then closes on this device. It is under the desk's address, so it opens while the desk is open.
export default async function ForgotPin() {
  const { data } = await (await sessionClient()).auth.getUser();
  if (!data.user?.email) redirect(`/sign-in?next=${DESK_HOME}/forgot-pin`);
  return (
    <DeskShell back={{ href: DESK_HOME, label: "Back to the desk" }} title="Forgot your PIN?">
      <p className="lead">Enter the password of your Unica account, then choose a new 4-digit PIN. The desk closes on this device.</p>
      <ForgotPinForm />
      <p className="small">No password on your account (you sign in with Google or a code)? On another device, sign in to Unica and choose Add or change your password, then come back to this page. No other device? Email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a> and we will help.</p>
    </DeskShell>
  );
}
