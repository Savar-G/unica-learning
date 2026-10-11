import "server-only";
import { userAgent } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChildInput } from "@/lib/account";
import { SITE_URL } from "@/lib/metadata";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { LINK_TTL_MS, MAX_LINKS_PER_HOUR, linkEmail, newToken } from "@/lib/sign-in-link";

// Server steps shared by the account routes (#62, #63). Every call uses the admin client (secret key).

// The admin API skips Supabase's own signup rate limit, so new parent rows are capped across the whole site.
// Pilot traffic is a handful of families; a script hits the cap at once.
const MAX_SIGNUPS_PER_10_MIN = 20;

/** "busy" when the site-wide signup cap is reached, "failed" when the count did not work, else null. */
export async function signupCap(admin: SupabaseClient): Promise<"busy" | "failed" | null> {
  const { count, error } = await admin.from("parents")
    .select("id", { count: "exact", head: true })
    .gt("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
  if (error) {
    console.error("[account] count failed", error.message);
    return "failed";
  }
  if ((count ?? 0) >= MAX_SIGNUPS_PER_10_MIN) {
    console.error("[account] signup cap reached");
    return "busy";
  }
  return null;
}

/** Writes the parent row and the first child for auth user `id`. Returns the child's id, or null after it removed the parent row again. */
export async function createParent(
  admin: SupabaseClient,
  id: string,
  parent: { name: string; email: string; postal: string; source: Record<string, string> },
  child: ChildInput,
): Promise<string | null> {
  const { error: parentError } = await admin.from("parents").insert({ id, name: parent.name, email: parent.email, postal: parent.postal, source: parent.source });
  if (parentError) {
    console.error("[account] parent insert failed", parentError.message);
    return null;
  }
  const { data, error } = await admin.from("children")
    .insert({ parent_id: id, first_name: child.firstName, grade: child.grade, province: child.province })
    .select("id").single<{ id: string }>();
  if (error || !data) {
    console.error("[account] child insert failed", error?.message);
    const { error: deleteError } = await admin.from("parents").delete().eq("id", id);
    if (deleteError) console.error("[account] ORPHAN parent row, delete it in the dashboard:", id, deleteError.message);
    return null;
  }
  return data.id;
}

/** True on a phone. The test needs a laptop or tablet (D-082). */
export const isPhone = (headers: Headers) => userAgent({ headers }).device.type === "mobile";

/**
 * The origin for links in emails. Production uses the public site URL, so a forged Host header cannot put another
 * site in a parent's email. Previews and local dev use the request's own origin, so the link opens the same deployment.
 */
export function linkOrigin(request: Request): string {
  return process.env.VERCEL_ENV === "production" ? SITE_URL : new URL(request.url).origin;
}

export type SendLinkResult = "sent" | "not_found" | "too_many" | "failed";

/** Emails the parent a one-time sign-in link (24 hours) that opens this child's start screen. */
export async function sendSignInLink(admin: SupabaseClient, parentId: string, childId: string, origin: string): Promise<SendLinkResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.error("[account] RESEND_API_KEY or EMAIL_FROM is not set");
    return "failed";
  }
  const [{ data: parent }, { data: child }, { count, error: countError }] = await Promise.all([
    admin.from("parents").select("name, email").eq("id", parentId).maybeSingle<{ name: string; email: string }>(),
    admin.from("children").select("first_name").eq("id", childId).eq("parent_id", parentId).maybeSingle<{ first_name: string }>(),
    admin.from("sign_in_links").select("id", { count: "exact", head: true })
      .eq("parent_id", parentId).gt("created_at", new Date(Date.now() - 60 * 60_000).toISOString()),
  ]);
  if (!parent || !child) return "not_found";
  if (countError) {
    console.error("[account] link count failed", countError.message);
    return "failed";
  }
  if ((count ?? 0) >= MAX_LINKS_PER_HOUR) return "too_many";

  const { token, hash } = newToken();
  const { error } = await admin.from("sign_in_links").insert({
    parent_id: parentId, child_id: childId, token_hash: hash, expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString(),
  });
  if (error) {
    console.error("[account] link insert failed", error.message);
    return "failed";
  }

  const url = `${origin}/sign-in/link?t=${token}`;
  const email = linkEmail({ parentName: parent.name, childName: child.first_name, url });
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [parent.email], reply_to: SUPPORT_EMAIL, ...email }),
    });
    if (!res.ok) {
      console.error("[account] link email failed", res.status, await res.text());
      return "failed";
    }
  } catch (e) {
    console.error("[account] link email error", e);
    return "failed";
  }
  return "sent";
}
