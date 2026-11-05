import { finishCardUpdate, type CardUpdateFinish } from "@/lib/billing";
import { liveCardUpdates } from "@/lib/billing-server";
import { parentDashboardAccess } from "@/lib/parent-dashboard-access";
import { ACCOUNT_PATH, type CardNotice } from "@/lib/parent-shell";
import { parentId, sessionClient } from "@/lib/supabase-auth";

const SESSION = /^cs_(?:test|live)_[A-Za-z0-9]+$/;
const NOTICE: Record<CardUpdateFinish, CardNotice | null> = { updated: "updated", stale: null, unconfirmed: "unconfirmed", incomplete: "unchanged", not_found: "failed", failed: "failed" };

// The writes keep inside this: see writeWindow in card-reconcile.ts.
export const maxDuration = 60;

// Stripe sends the parent back here after the hosted page saved a card (#554). This is where the card becomes the
// plan's default. The answer is always a redirect to the Account tab, which says what happened. A parent signed out on
// Stripe's page signs in and comes back to this address, so the card still takes effect. An address opened again from the
// browser's history changes nothing and says nothing: the normal page.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const to = (path: string) => Response.redirect(new URL(path, url.origin), 303);
  const parent = await parentId(await sessionClient());
  if (!parent) return to(`/sign-in?next=${encodeURIComponent(url.pathname + url.search)}`);
  if (!(await parentDashboardAccess(parent))) return to("/account");
  const session = url.searchParams.get("session_id");
  const seams = liveCardUpdates();
  const result: CardUpdateFinish = session && SESSION.test(session) && seams ? await finishCardUpdate(parent, session, seams) : "failed";
  const notice = NOTICE[result];
  return to(notice ? `${ACCOUNT_PATH}?card=${notice}` : ACCOUNT_PATH);
}
