import { pageMetadata } from "@/lib/metadata";
import { DeskGuard } from "@/components/desk-guard";
import { HIDE_ON_BACK } from "@/lib/desk-guard";

export const metadata = pageMetadata({ path: "/admin", title: "Admin", description: "Admin area.", index: false });

// Each page checks requireAdmin itself. A shared layout must never be the only authorization check. The desk guard
// (#301) sends a restored or already open admin page to the child's desk when it is open on this device.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <><script dangerouslySetInnerHTML={{ __html: HIDE_ON_BACK }} />{children}<DeskGuard /></>;
}
