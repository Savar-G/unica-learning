import Link from "next/link";
import type { ChildView } from "@/lib/parent-view";

/**
 * The desk, from the first shipped workbook (#551, #1024). Opening it is a form POST to /api/desk/open, which sets the desk
 * cookie, and a parent who has no PIN yet is sent to set one first. The frame's header and the Overview's name row both show
 * it; this one component keeps what it does in one place. Nothing here reads state, so a server page can use it too.
 */
export function DeskButton({ child, pinSet }: { child: Pick<ChildView, "id" | "currentWorkbook">; pinSet: boolean | null }) {
  if (!child.currentWorkbook) return null;
  if (pinSet === false) return <Link className="pd-desk" href="/account/pin?desk=1">Set your PIN</Link>;
  return (
    <form className="pd-desk-form" method="post" action="/api/desk/open">
      <input type="hidden" name="child" value={child.id} />
      <button type="submit" className="pd-desk">Open the desk <span aria-hidden="true">→</span></button>
    </form>
  );
}
