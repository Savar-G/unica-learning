import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import { DESK_COOKIE, DESK_HOME, openPageToken, readLock, type PageTokenResult } from "@/lib/desk";
import { pinIsSet } from "@/lib/parent-pin-server";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { workbookStore } from "@/lib/workbook-store";
import { DeskShell } from "@/components/desk-shell";

export const metadata = pageMetadata({
  path: `${DESK_HOME}/p`,
  title: "A workbook page",
  description: "Open this workbook page on the desk.",
  index: false,
});

// A page's QR code (#301): `/tutor/p/<token>`. The token is read with the parent's own session, so row-level security
// finds only the family's shipped workbooks; openPageToken checks the family and the status again. For the owner, an
// open desk for that child goes to the page; with no desk open, the parent confirms before the desk opens (a link
// alone never puts a device in desk mode). Anyone else is refused, with the same answer as a token that does not exist.
export default async function PageCode(props: PageProps<"/tutor/p/[token]">) {
  const { token } = await props.params;
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) redirect(`/sign-in?next=${encodeURIComponent(`${DESK_HOME}/p/${token}`)}`);
  const lock = readLock((await cookies()).get(DESK_COOKIE)?.value);
  const open = lock?.parentId === parent ? lock : null;
  const back = open ? { href: DESK_HOME, label: "Back to the desk" } : { href: "/account", label: "Your account" };

  let found: PageTokenResult | null = null;
  try {
    found = await openPageToken(workbookStore(db), parent, token);
  } catch (error) {
    console.error("[desk] page code load failed", error instanceof Error ? error.message : error);
  }
  if (!found) {
    return (
      <DeskShell back={back} title="We cannot open this page right now.">
        <p className="lead">Try again in a moment.</p>
      </DeskShell>
    );
  }
  if (found.status === "refused") {
    return (
      <DeskShell back={back} title="We cannot open this page.">
        <p className="lead">This page is not in this account, or its workbook is not ready on the desk yet. Check that you are signed in to the account of the child who has this workbook, then scan the code again.</p>
      </DeskShell>
    );
  }
  const target = `${DESK_HOME}?w=${found.workbookId}&p=${found.page}`;
  if (open?.childId === found.childId) redirect(target);

  const { data: child } = await db.from("children").select("first_name").eq("id", found.childId).maybeSingle();
  const name = child?.first_name ?? "your child";
  if (open) {
    return (
      <DeskShell back={back} title={`This page is from ${name}'s workbook.`}>
        <p className="lead">The desk on this device is open for another child. To open this page, a grown-up leaves the desk with the PIN, then scans the code again.</p>
      </DeskShell>
    );
  }
  const pinSet = await pinIsSet(parent);
  return (
    <DeskShell back={back} title={`Open ${name}'s desk at page ${found.page}?`}>
      <p className="lead">{name} sees this workbook page and can ask Maya for help. Leaving the desk needs your PIN.</p>
      {pinSet === false ? (
        <p><Link className="btn" href="/account/pin?desk=1">Set a PIN first</Link></p>
      ) : pinSet === null ? (
        <p className="acct-alert">We cannot open the desk right now. Try again in a moment.</p>
      ) : (
        <form method="post" action="/api/desk/open">
          <input type="hidden" name="child" value={found.childId} />
          <input type="hidden" name="w" value={found.workbookId} />
          <input type="hidden" name="p" value={found.page} />
          <button type="submit" className="btn">Open the desk</button>
        </form>
      )}
    </DeskShell>
  );
}
