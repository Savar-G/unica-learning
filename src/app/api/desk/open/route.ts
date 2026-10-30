import { NextResponse } from "next/server";
import { DESK_HOME } from "@/lib/desk";
import { openDesk, sameOrigin } from "@/lib/desk-server";
import { serverPins } from "@/lib/parent-pin-server";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { isUuid } from "@/lib/workbook-content";

// Opens the child's desk on this device (#301): a form POST from Parent home (`child`) or from a page QR code (`child`,
// `w` the workbook, `p` the page). The child is read with the parent's own session, so only their own child opens. The
// desk needs the parent's PIN to leave, so a parent with no PIN sets one first.
export async function POST(request: Request) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) return to("/sign-in");
  const form = await request.formData().catch(() => null);
  const childId = form?.get("child");
  if (!isUuid(childId)) return to("/account");
  const { data: child } = await db.from("children").select("id").eq("id", childId).maybeSingle();
  if (!child) return to("/account");
  let pinSet: boolean | null = null;
  try {
    pinSet = (await serverPins()?.isSet(parent)) ?? null;
  } catch (error) {
    console.error("[desk] pin load failed", error instanceof Error ? error.message : error);
  }
  if (pinSet === null) return to("/account?desk=error");
  if (!pinSet) return to("/account/pin?desk=1");

  const at = new URLSearchParams();
  const workbook = form?.get("w");
  const page = Number(form?.get("p"));
  if (isUuid(workbook)) at.set("w", workbook);
  if (Number.isInteger(page) && page > 0) at.set("p", String(page));
  const response = to(at.size ? `${DESK_HOME}?${at}` : DESK_HOME);
  openDesk(response, parent, child.id);
  return response;
}
