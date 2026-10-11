import { connection } from "next/server";
import { pageMetadata } from "@/lib/metadata";
import { unsubscribeState, type UnsubscribeState } from "@/lib/reminder-store";
import { adminClient } from "@/lib/supabase-auth";
import { TrackOnce } from "@/components/account";
import { SupportPage } from "@/components/support-page";
import { Unsubscribe } from "@/components/unsubscribe";

export const metadata = pageMetadata({
  path: "/unsubscribe",
  title: "Reminder emails",
  description: "Turn off reminder emails about the free math test.",
  index: false,
});

const OFF = (
  <>
    <h1>Reminders are off.</h1>
    <p className="lead">We will not send you more reminder emails about the free math test. When your child finishes a test, you still get the report by email.</p>
  </>
);
const FAILED = (
  <>
    <h1>We could not turn off reminders.</h1>
    <p className="lead">Something went wrong on our side. Try the link again later, or reply to any reminder email and we will turn them off.</p>
  </>
);

// The page a reminder's unsubscribe link opens (#73, CASL). Not behind the pilot setting: the link in a sent email must
// keep working for 60 days. No sign-in: the token in the link stands for the parent. Opening the page turns reminders
// off (one click); the report email for a finished test is not a reminder and still goes.
export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  await connection();
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";
  const admin = adminClient();
  let state: UnsubscribeState | "failed" = "failed";
  try {
    if (admin) state = await unsubscribeState(admin, token);
  } catch (e) {
    console.error("[unsubscribe] lookup failed", e instanceof Error ? e.message : e);
  }

  if (state === "subscribed") {
    return (
      <SupportPage label="Reminder emails" title="">
        <Unsubscribe token={token} done={OFF} failed={FAILED} />
        <noscript>
          <h1>Turn off reminders.</h1>
          <p className="lead">We will not send you more reminder emails about the free math test. When your child finishes a test, you still get the report by email.</p>
          <form method="post" action="/api/unsubscribe">
            <input type="hidden" name="t" value={token} />
            <input type="hidden" name="page" value="1" />
            <button className="btn" type="submit">Turn off reminders <span className="arr">→</span></button>
          </form>
        </noscript>
      </SupportPage>
    );
  }
  return (
    <SupportPage label="Reminder emails" title="">
      <TrackOnce event="unsubscribe_page" props={{ status: state }} />
      {state === "unsubscribed" && OFF}
      {state === "failed" && FAILED}
      {state === "unknown" && (
        <>
          <h1>This link does not work.</h1>
          <p className="lead">Check that you opened the full link from the email. To stop reminders, you can also reply to any reminder email and we will turn them off.</p>
        </>
      )}
    </SupportPage>
  );
}
