import { cookies } from "next/headers";
import { DESK_COOKIE, deskAccess } from "@/lib/desk";
import { sameOrigin } from "@/lib/desk-server";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { liveReferrals } from "@/lib/referral-server";
import { applyReferral, referralOverview } from "@/lib/referrals";
import type { ReferralResult } from "@/lib/referral-contract";
import { linkOrigin } from "@/lib/account-server";

const reply = (result: ReferralResult, status?: number) => Response.json(result, { status: status ?? (result.ok ? 200 : result.error === "unavailable" ? 503 : result.error === "rate_limited" ? 429 : 400), headers: { "Cache-Control": "no-store" } });
async function access() {
  const parent = await parentId(await sessionClient());
  if (!parent) return { error: "signed_out" as const };
  if (deskAccess((await cookies()).get(DESK_COOKIE)?.value, parent).state === "open") return { error: "desk_open" as const };
  return { parent };
}
export async function GET(request: Request) {
  const user = await access();
  if (user.error) return reply({ ok: false, error: user.error }, user.error === "signed_out" ? 401 : 423);
  try {
    const services = liveReferrals();
    return reply(services ? await referralOverview(user.parent, services, linkOrigin(request)) : { ok: false, error: "unavailable" });
  } catch { return reply({ ok: false, error: "unavailable" }); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ ok: false, error: "invalid" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ ok: false, error: "invalid" }, 415);
  const user = await access();
  if (user.error) return reply({ ok: false, error: user.error }, user.error === "signed_out" ? 401 : 423);
  try {
    const text = await request.text();
    if (text.length > 512) return reply({ ok: false, error: "invalid" }, 413);
    let data: unknown;
    try { data = JSON.parse(text); } catch { return reply({ ok: false, error: "invalid" }); }
    const code = data && typeof data === "object" && "code" in data ? data.code : null;
    const services = liveReferrals();
    return reply(services ? await applyReferral(user.parent, code, services, linkOrigin(request)) : { ok: false, error: "unavailable" });
  } catch { return reply({ ok: false, error: "unavailable" }); }
}
