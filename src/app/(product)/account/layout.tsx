import { DeskGuard } from "@/components/desk-guard";
import { HIDE_ON_BACK } from "@/lib/desk-guard";

// Every account page carries the desk guard (#301): a page restored from history or a tab already open goes to the
// child's desk when it is open on this device. Each page checks the session itself.
export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return <><script dangerouslySetInnerHTML={{ __html: HIDE_ON_BACK }} />{children}<DeskGuard /></>;
}
