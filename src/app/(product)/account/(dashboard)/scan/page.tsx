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
import { parentId, sessionClient } from "@/lib/supabase-auth";
import "@/components/scan-tab.css";

export const metadata = pageMetadata({ path: "/account/scan", title: "Scan pages", description: "Save a finished workbook page.", index: false });

// The Scan pages tab (#564, spec #544, D-246). A phone or tablet gets the camera flow (src/components/scan-pages.tsx).
// Any other device, or one the server cannot tell (iPadOS Safari reports a Mac), gets "Please take a picture with your
// phone", a QR code of this page's address, "Email me the link", and a way to continue on this device. scanSession is
// the gate, as before: scanning stays closed to every family it does not release to. A signed-out visitor signs in
// first and comes back here, so the QR code works on a phone that is not signed in.

/** The address's origin: the public site in production, so a forged Host header cannot change the QR code there. */
function origin(h: Headers): string {
  if (process.env.VERCEL_ENV === "production") return SITE_URL;
  const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${h.get("host")}`;
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
  // The child in view in the dashboard (the last child viewed), else the oldest; the camera flow opens on that child.
  const inView = pickChild(list, null, dashboard?.remembered ?? null);
  const screen = scanScreen(userAgent({ headers: h }).device.type, query[CONTINUE_HERE] === "1");
  const back = !dashboard && <p><Link href="/account">Back to your account</Link></p>;

  if (screen === "camera") {
    const ordered = inView ? [inView, ...list.filter((k) => k.id !== inView.id)] : list;
    return <SupportPage label="Your account" title="Scan pages">
      {back}
      <ScanPages childrenList={ordered} parent={parent} noticeAcknowledged={Boolean(notice.data)} />
    </SupportPage>;
  }

  const url = scanPageUrl(origin(h));
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#2b2622", light: "#ffffff" } });
  const pages = inView ? `${inView.first_name}'s finished pages` : "each finished page";
  return <SupportPage label="Scan pages" title="Please take a picture with your phone">
    {back}
    <div className="scan-away">
      <div className="scan-away-qr" role="img" aria-label="QR code that opens Scan pages on your phone" dangerouslySetInnerHTML={{ __html: qr }} />
      <div className="scan-away-text">
        <p className="lead">Point your phone&apos;s camera at this code. It opens Scan pages on your phone, where you take a picture of {pages}.</p>
        {inView && <ScanEmailLink childId={inView.id} />}
        <p className="small scan-away-here">On a tablet with a camera? <Link href={`${SCAN_PATH}?${CONTINUE_HERE}=1`}>Take the pictures on this device</Link></p>
      </div>
    </div>
  </SupportPage>;
}
