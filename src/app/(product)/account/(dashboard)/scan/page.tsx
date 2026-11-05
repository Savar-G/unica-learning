import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import QRCode from "qrcode";
import { scanSession } from "@/lib/scan-photo-server";
import { SupportPage } from "@/components/support-page";
import { ScanPages } from "@/components/scan-pages";
import { ScanEmailLink } from "@/components/scan-email-link";
import { pageMetadata, SITE_URL } from "@/lib/metadata";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import { pickChild } from "@/lib/parent-shell";
import { CONTINUE_HERE, SCAN_PATH, scanPageUrl, scanScreen, scanSignInPath } from "@/lib/scan-tab";
import { dayPages } from "@/lib/scan-stack";
import { isUuid } from "@/lib/workbook-content";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import "@/components/scan-tab.css";

export const metadata = pageMetadata({ path: "/account/scan", title: "Scan pages", description: "Save a finished workbook page.", index: false });

// The Scan pages tab (#564, spec #544, D-246; the stack from round r565, D-269 to D-276). A phone or tablet gets the
// stack and its photo buttons (src/components/scan-pages.tsx). Any other device, or one the server cannot tell (iPadOS
// Safari reports a Mac), gets "Please take a picture with your phone", a QR code of this page's address, "Email me the
// link", a way to continue on this device, and beside them the pages from the phone, live, with Send (D-273). scanSession
// is the gate, as before. A signed-out visitor signs in first and comes back here, so the QR code works on a phone that
// is not signed in. `?w=<workbook>&p=<page>` comes from a page's own QR code (the r565 build note): it names that page.

/** The address's origin: the public site in production, so a forged Host header cannot change the QR code there. */
function origin(h: Headers): string {
  if (process.env.VERCEL_ENV === "production") return SITE_URL;
  const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${h.get("host")}`;
}

type Db = Awaited<ReturnType<typeof scanSession>>["db"];

/** The page a QR code opened, read with the parent's own session (row-level security finds only the family's books). */
async function focusedPage(db: Db, workbook: unknown, page: unknown): Promise<{ childId: string; label: string } | null> {
  const number = typeof page === "string" && /^[0-9]{1,4}$/.test(page) ? Number(page) : null;
  if (!isUuid(workbook) || number === null) return null;
  const [book, pages] = await Promise.all([
    db.from("workbooks").select("id,child_id,number,status").eq("id", workbook).maybeSingle(),
    db.from("workbook_pages").select("id,page_number,day_label").eq("workbook_id", workbook),
  ]);
  if (book.error || pages.error || !book.data || book.data.status !== "shipped") return null;
  const numbered = dayPages((pages.data ?? []).map((p) => ({ id: p.id, workbookId: workbook, book: book.data!.number, pageNumber: p.page_number, day: p.day_label })));
  const found = numbered.find((p) => p.pageNumber === number);
  return { childId: book.data.child_id, label: found ? `${found.day} · Page ${found.pageOfDay}` : `page ${number} of Workbook ${book.data.number}` };
}

export default async function ScanPage({ searchParams }: PageProps<"/account/scan">) {
  if (!(await parentId(await sessionClient()))) redirect(scanSignInPath);
  const { db, parent } = await scanSession();
  const [kids, notice, dashboard, h, query] = await Promise.all([
    db.from("children").select("id,first_name").eq("parent_id", parent).order("created_at"),
    db.from("scan_photo_notices").select("parent_id").eq("parent_id", parent).maybeSingle(),
    parentDashboard(),
    headers(),
    searchParams,
  ]);
  const list = kids.data ?? [];
  const focus = query.w || query.p ? await focusedPage(db, query.w, query.p).catch(() => null) : null;
  // The page's child when a QR code opened it, else the child in view in the dashboard (the last child viewed), else the oldest.
  const inView = list.find((k) => k.id === focus?.childId) ?? pickChild(list, null, dashboard?.remembered ?? null);
  const ordered = inView ? [inView, ...list.filter((k) => k.id !== inView.id)] : list;
  const screen = scanScreen(userAgent({ headers: h }).device.type, query[CONTINUE_HERE] === "1");
  const back = !dashboard && <p><Link href="/account">Back to your account</Link></p>;

  if (screen === "camera") {
    return <SupportPage label="Your account" title="Scan pages">
      {back}
      <ScanPages childrenList={ordered} parent={parent} noticeAcknowledged={Boolean(notice.data)} focus={focus} />
    </SupportPage>;
  }

  const url = scanPageUrl(origin(h));
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#2b2622", light: "#ffffff" } });
  const pages = inView ? `${inView.first_name}'s finished pages` : "each finished page";
  return <SupportPage label="Your account" title="Scan pages">
    {back}
    <div className="scan-away">
      <div className="scan-away-text">
        <div className="scan-away-qr" role="img" aria-label="QR code that opens Scan pages on your phone" dangerouslySetInnerHTML={{ __html: qr }} />
        <h2>Please take a picture with your phone</h2>
        <p className="lead">Point your phone&apos;s camera at this code. It opens Scan pages on your phone, where you take a picture of {pages}. Your pages show here as you take them.</p>
        {inView && <ScanEmailLink childId={inView.id} />}
        <p className="small scan-away-here"><Link href={`${SCAN_PATH}?${CONTINUE_HERE}=1`}>Take the pictures on this device</Link></p>
      </div>
      {inView && <section className="scan-away-stack" aria-label="From your phone">
        <h2>From your phone</h2>
        <ScanPages mode="desktop" childrenList={ordered} parent={parent} noticeAcknowledged={Boolean(notice.data)} />
      </section>}
    </div>
  </SupportPage>;
}
