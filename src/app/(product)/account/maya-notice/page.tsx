import Link from "next/link";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { familyProvince, familyZone, formatInZone } from "@/lib/family-time";
import { MAYA_NOTICE, MAYA_NOTICE_VERSION, mayaNotice, type NoticeAcceptance } from "@/lib/maya-notice";
import { noticeStore } from "@/lib/maya-notice-store";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { SupportPage } from "@/components/support-page";
import { isUuid } from "@/lib/workbook-content";

export const metadata = pageMetadata({
  path: "/account/maya-notice",
  title: "Before your child uses Maya",
  description: "What a chat with Maya does, what we keep, and what we need from a parent.",
  index: false,
});

// The parent notice before a child's first chat or call with Maya (#529). A parent page: while the desk is open, the proxy
// sends this address back to the desk, so a child never sees it. `child`, `w`, `p` and `from` keep where the parent was going.
export default async function MayaNotice({ searchParams }: PageProps<"/account/maya-notice">) {
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) redirect("/sign-in?next=/account/maya-notice");
  const { child, w, p, from, saved, changed, error } = await searchParams;
  const going = {
    ...(isUuid(child) ? { child } : {}),
    ...(isUuid(w) ? { w } : {}),
    ...(typeof p === "string" && /^\d{1,4}$/.test(p) ? { p } : {}),
    ...(from === "qr" ? { from: "qr" } : {}),
  };
  const fields = Object.entries(going).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);

  let accepted: NoticeAcceptance | null = null;
  let readFailed = false;
  try {
    accepted = await mayaNotice(noticeStore(db)).acceptance(parent);
  } catch (e) {
    readFailed = true;
    console.error("[maya notice] load failed", e instanceof Error ? e.message : "unknown");
  }
  const [{ data: family }, { data: kids }] = await Promise.all([
    db.from("parents").select("postal, time_zone").maybeSingle(),
    db.from("children").select("id, created_at, province").order("created_at").order("id"),
  ]);
  const zone = familyZone({ timeZone: family?.time_zone, postal: family?.postal, province: familyProvince(kids ?? []) });
  const openDesk = "child" in going && (
    <form method="post" action="/api/desk/open">
      {fields}
      <button type="submit" className="btn">Open the desk <span aria-hidden="true">→</span></button>
    </form>
  );

  if (saved === "1" && accepted) {
    return (
      <SupportPage label="Your account" title="Thank you. Maya is on for your family.">
        <p className="lead">Your child can chat with Maya on the desk. We saved your answer. You can read this notice again from your account.</p>
        <div className="acct-notice-actions">
          {openDesk}
          <Link className={openDesk ? "btn ghost" : "btn"} href="/account">Back to your account</Link>
        </div>
      </SupportPage>
    );
  }

  return (
    <SupportPage label="Your account" title="Before your child uses Maya.">
      {error === "1" && <p role="alert" className="acct-alert">We could not save your answer. Try again in a moment.</p>}
      {changed === "1" && <p role="status" className="acct-alert">This notice changed. Please read it again.</p>}
      {readFailed && <p role="alert" className="acct-alert">We cannot check your answer right now. Try again in a moment.</p>}
      {accepted && <p role="status" className="acct-alert acct-saved">You agreed on {formatInZone(Date.parse(accepted.acceptedAt), zone, { year: "numeric", month: "long", day: "numeric" })}.</p>}
      <p className="lead">Maya is our AI Teaching Assistant. A parent or guardian must read this and agree before a child&apos;s first chat. One agreement covers all your children.</p>
      {MAYA_NOTICE.map((part) => (
        <section key={part.title}>
          <h2>{part.title}</h2>
          <p>{part.text}</p>
        </section>
      ))}
      <p className="small acct-notice-more">To turn Maya off later, email us. The <Link href="/privacy">privacy policy</Link> names the companies and explains how long we keep each record. See also the <Link href="/terms">terms</Link>.</p>
      {!accepted && !readFailed ? (
        <div className="acct-notice-actions">
          <form method="post" action="/api/account/maya-notice">
            {fields}
            <input type="hidden" name="version" value={MAYA_NOTICE_VERSION} />
            <button type="submit" className="btn">I agree</button>
          </form>
          {"child" in going ? (
            <form method="post" action="/api/desk/open">
              {fields}
              <input type="hidden" name="maya" value="later" />
              <button type="submit" className="btn ghost">Open the desk without Maya</button>
            </form>
          ) : <Link className="btn ghost" href="/account">Not now</Link>}
        </div>
      ) : (
        <div className="acct-notice-actions">
          {openDesk}
          <Link className={openDesk ? "btn ghost" : "btn"} href="/account">Back to your account</Link>
        </div>
      )}
    </SupportPage>
  );
}
