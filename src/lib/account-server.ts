import "server-only";
import { userAgent } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { ChildInput } from "@/lib/account";
import { SITE_URL } from "@/lib/metadata";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { emailConfigProblem, sendEmail } from "@/lib/email-delivery";
import { LINK_TTL_MS, MAX_LINKS_PER_HOUR, linkEmail, newToken, startPath } from "@/lib/sign-in-link";
import { phoneWelcomeEmail, welcomeEmail } from "@/lib/founder-emails";

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
  admin: SupabaseClient<Database>,
  id: string,
  parent: { name: string; email: string; phone: string; source: Record<string, string> },
  child: ChildInput,
): Promise<Admission> {
  const { data, error } = await admin.rpc("create_family", {
    p_parent: id, p_name: parent.name, p_email: parent.email, p_postal: null, p_source: parent.source,
    p_child_name: child.firstName, p_child_grade: child.grade, p_child_province: child.province, p_phone: parent.phone,
  });
  if (error) {
    console.error("[account] create_family failed", error.code);
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

/** What claim_family_finish answers (migration sign_in_races), or "failed" when the call did not work. */
export type FinishClaim = "claimed" | "exists" | "busy" | "failed";

/** How long a finish waits for another tab's finish of the same user, and how often it asks again. */
export const FINISH_WAIT = { tries: 20, stepMs: 300 } as const;

/**
 * Takes the one finish of Auth user `user` (docs/state-machines.md, item 12): no other /api/account/finish of this user
 * changes the password until releaseFamilyFinish. While another tab holds the claim, asks again every `stepMs`, up to
 * `tries` times; that tab's finish usually makes the family first, and this one then answers "exists".
 */
export async function claimFamilyFinish(admin: SupabaseClient<Database>, user: string, claim: string, wait: { tries: number; stepMs: number } = FINISH_WAIT): Promise<FinishClaim> {
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await admin.rpc("claim_family_finish", { p_user: user, p_claim: claim });
    if (error) {
      console.error("[account] claim_family_finish failed", error.code, error.message);
      return "failed";
    }
    if (data === "claimed" || data === "exists") return data;
    if (data !== "busy") {
      console.error("[account] claim_family_finish answered", JSON.stringify(data).slice(0, 200));
      return "failed";
    }
    if (attempt >= wait.tries) return "busy";
    await new Promise((r) => setTimeout(r, wait.stepMs));
  }
}

/** Lets the finish claim go. Never throws: a claim left behind ends by itself after 5 minutes. */
export async function releaseFamilyFinish(admin: SupabaseClient<Database>, user: string, claim: string): Promise<void> {
  try {
    const { error } = await admin.rpc("release_family_finish", { p_user: user, p_claim: claim });
    if (error) console.error("[account] release_family_finish failed", error.code, error.message);
  } catch (e) {
    console.error("[account] release_family_finish failed", e instanceof Error ? e.message : e);
  }
}

/** True on a phone. The test needs a laptop or tablet (D-082). */
export const isPhone = (headers: Headers) => userAgent({ headers }).device.type === "mobile";

/**
 * The origin for links in emails. Production uses the public site URL, so a forged Host header cannot put another
 * site in a parent's email. Previews and local dev use the request's own origin, so the link opens the same deployment.
 */
/**
 * The founders' welcome (D-225), once: the caller sends it only when create_family made the family. A phone signup gets
 * the sign-in link email instead. Never throws; a welcome that does not go is logged and not tried again.
 */
export async function sendWelcome(p: { name: string; email: string; childName: string; childId: string; origin: string }): Promise<void> {
  const email = welcomeEmail({ parentName: p.name, childName: p.childName, url: `${p.origin}${startPath(p.childId)}` });
  const outcome = await sendEmail({ sender: { to: "parent", from: "founders" }, to: p.email, replyTo: SUPPORT_EMAIL, ...email });
  if (outcome.status !== "sent") console.error("[account] welcome email failed", outcome.status, outcome.error);
}

export function linkOrigin(request: Request): string {
  return process.env.VERCEL_ENV === "production" ? SITE_URL : new URL(request.url).origin;
}

export type SendLinkResult = "sent" | "not_found" | "too_many" | "failed";

/**
 * Emails the parent a one-time sign-in link (24 hours) that opens this child's start screen. `welcome`: the first link
 * of a phone signup, sent as the founders' welcome (D-225); a link asked for again is the team's plain link email.
 */
export async function sendSignInLink(admin: SupabaseClient<Database>, parentId: string, childId: string, origin: string, { welcome = false }: { welcome?: boolean } = {}): Promise<SendLinkResult> {
  // Stop before a token row is written: without the configuration the email cannot go.
  if (emailConfigProblem()) {
    console.error("[account] RESEND_API_KEY or EMAIL_FROM is not set");
    return "failed";
  }
  const [{ data: parent }, { data: child }] = await Promise.all([
    admin.from("parents").select("name, email").eq("id", parentId).maybeSingle(),
    admin.from("children").select("first_name").eq("id", childId).eq("parent_id", parentId).maybeSingle(),
  ]);
  if (!parent || !child) return "not_found";

  // The rate limit and the new row in one step (migration sign_in_races): the database counts the parent's links of
  // the last hour and inserts under one lock for the parent, so parallel requests cannot all pass the limit.
  const { token, hash } = newToken();
  const { data: issued, error } = await admin.rpc("issue_sign_in_link", {
    p_parent: parentId, p_child: childId, p_token_hash: hash, p_max: MAX_LINKS_PER_HOUR, p_ttl_seconds: LINK_TTL_MS / 1000,
  });
  if (error) {
    console.error("[account] link issue failed", error.code, error.message);
    return "failed";
  }
  if (issued === "not_found") return "not_found";
  if (issued === "too_many") return "too_many";
  if (issued !== "created") {
    console.error("[account] issue_sign_in_link answered", JSON.stringify(issued).slice(0, 200));
    return "failed";
  }

  const url = `${origin}/sign-in/link?t=${token}`;
  const link = { parentName: parent.name, childName: child.first_name, url };
  const email = welcome ? phoneWelcomeEmail(link) : linkEmail(link);
  // The link row is its own guard (the rate limit above), so the email needs no send key.
  const sender = welcome ? { to: "parent" as const, from: "founders" as const } : { to: "parent" as const };
  const outcome = await sendEmail({ sender, to: parent.email, replyTo: SUPPORT_EMAIL, ...email });
  if (outcome.status !== "sent") {
    console.error("[account] link email failed", outcome.status, outcome.error);
    return "failed";
  }
  return "sent";
}
