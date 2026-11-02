import Link from "next/link";
import { redirect } from "next/navigation";
import { sessionClient } from "@/lib/supabase-auth";
import { SupportPage } from "@/components/support-page";
import { ScanPages } from "@/components/scan-pages";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: "/account/scan", title: "Scan pages", description: "Save a finished workbook page.", index: false });

export default async function ScanPage() {
  const db = await sessionClient();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect("/sign-in");
  const kids = await db.from("children").select("id,first_name").eq("parent_id", data.user.id).order("created_at");
  return <SupportPage label="Your account" title="Scan pages">
    <p><Link href="/account">Back to your account</Link></p>
    <ScanPages childrenList={kids.data ?? []} parent={data.user.id} />
  </SupportPage>;
}
