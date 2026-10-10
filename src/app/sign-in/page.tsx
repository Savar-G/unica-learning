import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { requirePilot } from "@/lib/pilot";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { SignIn } from "@/components/account";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/sign-in",
  title: "Sign in",
  description: "Sign in to your account to see your children and start the free assessment.",
  index: false,
});

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  await requirePilot();
  if (await parentId(await sessionClient())) redirect("/account");
  const { created, error } = await searchParams;
  return (
    <SupportPage label="Your account" title="Sign in.">
      <SignIn created={created === "1"} googleFailed={error === "google"} />
    </SupportPage>
  );
}
