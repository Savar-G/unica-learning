import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DESK_COOKIE, readLock } from "@/lib/desk";
import { sameOrigin } from "@/lib/desk-server";
import { serverMayaNotice } from "@/lib/maya-notice-server";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { isUuid } from "@/lib/workbook-content";

// A parent agrees to the Maya notice (#529): a form POST from /account/maya-notice. Who agreed comes from the session,
// never from the form. A device with an open desk is refused here as well as in the proxy, because a child must not agree.
export async function POST(request: Request) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const parent = await parentId(await sessionClient());
  if (!parent) return to("/sign-in");
  if (readLock((await cookies()).get(DESK_COOKIE)?.value)) return NextResponse.json({ ok: false, error: "desk_open" }, { status: 423 });
  const form = await request.formData().catch(() => null);
  // Where the parent was going stays in the address, so "Open the desk" comes next. The open route checks each value.
  const back = new URLSearchParams();
  const child = form?.get("child"), workbook = form?.get("w"), page = Number(form?.get("p"));
  if (isUuid(child)) back.set("child", child);
  if (isUuid(workbook)) back.set("w", workbook);
  if (Number.isInteger(page) && page > 0) back.set("p", String(page));
  if (form?.get("from") === "qr") back.set("from", "qr");
  const notice = serverMayaNotice();
  try {
    if (!notice) throw new Error("no secret key");
    const result = await notice.accept(parent, parent, form?.get("version"));
    back.set(result === "saved" ? "saved" : "changed", "1");
  } catch (error) {
    console.error("[maya notice] save failed", error instanceof Error ? error.message : "unknown");
    back.set("error", "1");
  }
  return to(`/account/maya-notice?${back}`);
}
