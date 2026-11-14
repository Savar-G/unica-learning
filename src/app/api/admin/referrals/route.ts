import { cookies } from "next/headers";
import { adminSession } from "@/lib/admin-store";
import { adminClient } from "@/lib/supabase-auth";
import { sameOrigin } from "@/lib/desk-server";
import { DESK_COOKIE, deskAccess } from "@/lib/desk";
import { isUuid } from "@/lib/assessment-store";
import { referralCode } from "@/lib/referral-contract";
import { liveReferrals } from "@/lib/referral-server";
import { refreshReferralHistory } from "@/lib/referrals";
import { referralStore } from "@/lib/referral-store";

export async function POST(request: Request) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const admin = await adminSession();
  if (!admin) return reply({ ok: false }, 404);
  if (!sameOrigin(request)) return reply({ ok: false }, 403);
  if (deskAccess((await cookies()).get(DESK_COOKIE)?.value, admin.userId).state === "open") return reply({ ok: false }, 423);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ ok: false }, 415);
  try {
    const raw = await request.text();
    if (raw.length > 2500) return reply({ ok: false }, 413);
    const body = JSON.parse(raw);
    if (!body || !isUuid(body.parent)) return reply({ ok: false }, 400);
    const service = adminClient();
    if (!service) return reply({ ok: false }, 503);
    const store = referralStore(service);
    if (body.action === "preview" && referralCode(body.code) && typeof body.reason === "string" && body.reason.trim().length > 0 && body.reason.length <= 1000) {
      const services = liveReferrals();
      if (!services) return reply({ ok: false }, 503);
      await refreshReferralHistory(body.parent, services);
      return reply(await store.command({ action: "preview", parent: body.parent, actor: admin.userId, code: referralCode(body.code)!, reason: body.reason }));
    }
    if (body.action === "correct" && isUuid(body.preview)) return reply(await store.command({ action: "correct", parent: body.parent, actor: admin.userId, preview: body.preview }));
    return reply({ ok: false }, 400);
  } catch { return reply({ ok: false, error: "unavailable" }, 503); }
}
