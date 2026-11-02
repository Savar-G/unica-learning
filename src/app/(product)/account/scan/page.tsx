import Link from "next/link";
import { scanSession } from "@/lib/scan-photo-server";
import { SupportPage } from "@/components/support-page";
import { ScanPages } from "@/components/scan-pages";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: "/account/scan", title: "Scan pages", description: "Save a finished workbook page.", index: false });

export default async function ScanPage() {
  const { db, parent } = await scanSession();
  const [kids, notice] = await Promise.all([
    db.from("children").select("id,first_name").eq("parent_id", parent).order("created_at"),
    db.from("scan_photo_notices").select("parent_id").eq("parent_id", parent).maybeSingle(),
  ]);
  return <SupportPage label="Your account" title="Scan pages">
    <p><Link href="/account">Back to your account</Link></p>
    <ScanPages childrenList={kids.data ?? []} parent={parent} noticeAcknowledged={Boolean(notice.data)} />
  </SupportPage>;
}
