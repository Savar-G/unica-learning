import "server-only";
import { userAgent } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChildInput } from "@/lib/account";
import { SITE_URL } from "@/lib/metadata";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { emailConfigProblem, sendEmail } from "@/lib/email-delivery";
import { LINK_TTL_MS, MAX_LINKS_PER_HOUR, linkEmail, newToken } from "@/lib/sign-in-link";

// Server steps shared by the account routes (#62, #63). Every call uses the admin client (secret key).

/**
 * What create_family answers (migration add_family_admission, #82). "created" with the first child's id; "exists" when
 * the parent row is already there; "busy" at the site-wide cap (20 new families in 10 minutes); "unavailable" while the
 * family is being deleted (#78); "failed" when the call did not work.
 */
export type Admission = { status: "created"; child: string } | { status: "exists" | "busy" | "unavailable" | "failed" };

/**
 * Writes the parent row and the first child for auth user `id` in one database transaction. The cap check and both
 * inserts run under one lock, so parallel requests cannot all pass the cap, and a failed insert leaves no half family.
 */
export async function createFamily(
  admin: SupabaseClient,
  id: string,
  parent: { name: string; email: string; postal: string; source: Record<string, string> },
  child: ChildInput,
): Promise<Admission> {
  const { data, error } = await admin.rpc("create_family", {
    p_parent: id, p_name: parent.name, p_email: parent.email, p_postal: parent.postal, p_source: parent.source,
    p_child_name: child.firstName, p_child_grade: child.grade, p_child_province: child.province,
  });
  if (error) {
    console.error("[account] create_family failed", error.code, error.message);
    return { status: "failed" };
  }
  const result = (data ?? {}) as { status?: unknown; child?: unknown };
  if (result.status === "created" && typeof result.child === "string") return { status: "created", child: result.child };
  if (result.status === "exists" || result.status === "busy" || result.status === "unavailable") {
    if (result.status === "busy") console.error("[account] family cap reached");
    return { status: result.status };
  }
  console.error("[account] create_family answered", JSON.stringify(result).slice(0, 200));
  return { status: "failed" };
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
  // Stop before a token row is written: without the configuration the email cannot go.
  if (emailConfigProblem()) {
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
  // The link row is its own guard (the rate limit above), so the email needs no send key.
  const outcome = await sendEmail({ sender: { to: "parent" }, to: parent.email, replyTo: SUPPORT_EMAIL, ...email });
  if (outcome.status !== "sent") {
    console.error("[account] link email failed", outcome.status, outcome.error);
    return "failed";
  }
  return "sent";
}
