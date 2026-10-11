import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: "/admin", title: "Admin", description: "Admin area.", index: false });

// Each page checks requireAdmin itself. A shared layout must never be the only authorization check.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
