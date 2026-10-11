import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { requirePilot } from "@/lib/pilot";
import { safeNext } from "@/lib/sign-in-link";
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
  const { created, error, next: nextParam } = await searchParams;
  // Where to go after sign-in, for example the report a parent opened from the email (#65). Only paths on this site.
  const next = safeNext(typeof nextParam === "string" ? nextParam : null);
  if (await parentId(await sessionClient())) redirect(next);
  return (
    <SupportPage label="Your account" title="Sign in.">
      <SignIn created={created === "1"} googleFailed={error === "google"} next={next} />
    </SupportPage>
  );
}
