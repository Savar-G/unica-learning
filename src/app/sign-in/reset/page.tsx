import { pageMetadata } from "@/lib/metadata";
import { requirePilot } from "@/lib/pilot";
import { ResetRequest } from "@/components/account";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/sign-in/reset",
  title: "Reset your password",
  description: "Get an email with a link to choose a new password.",
  index: false,
});

// Password reset by email (#63). Supabase sends the email through Resend; its link opens /auth/confirm.
export default async function ResetPassword({ searchParams }: PageProps<"/sign-in/reset">) {
  await requirePilot();
  const { expired } = await searchParams;
  return (
    <SupportPage label="Your account" title="Reset your password.">
      <p className="lead">Enter the email of your account. We will send you a link to choose a new password.</p>
      <ResetRequest expired={expired === "1"} />
    </SupportPage>
  );
}
