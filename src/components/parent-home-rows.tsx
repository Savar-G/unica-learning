import Link from "next/link";
import { ChatUsageRow } from "@/components/chat-usage";
import type { ChatUsage } from "@/lib/maya-chat";
import type { WorkbookSummary } from "@/lib/workbook-content";

/** The parent notice before a child's first chat (#529): one card for the family, above the children. */
export function MayaNoticeCard() {
  return (
    <div className="acct-card acct-notice">
      <h2>Before your child uses Maya.</h2>
      <p>Please read a short notice and agree. A child cannot do this for you.</p>
      <Link className="btn" href="/account/maya-notice">Read the notice</Link>
    </div>
  );
}

/** What the desk shows the child, and what it needs from the parent. */
export function DeskText({ name, workbook, pinSet }: { name: string; workbook: WorkbookSummary; pinSet: boolean | null }) {
  return (
    <span>
      <b>Workbook {workbook.number}</b>
      <span className="small">{pinSet === false
        ? `${name} needs your PIN to leave the desk. Set your PIN, then open the desk.`
        : `On the desk, ${name} sees this workbook. Leaving the desk needs your PIN.`}</span>
    </span>
  );
}

/** The child's workbook and "Open the desk" (a form POST, so it works without JavaScript). No PIN yet: set one first. */
export function DeskRow({ childId, name, workbook, pinSet }: { childId: string; name: string; workbook: WorkbookSummary; pinSet: boolean | null }) {
  return (
    <div className="acct-desk">
      <DeskText name={name} workbook={workbook} pinSet={pinSet} />
      {pinSet === false ? (
        <Link className="btn ghost" href="/account/pin?desk=1">Set your PIN</Link>
      ) : (
        <form method="post" action="/api/desk/open">
          <input type="hidden" name="child" value={childId} />
          <button type="submit" className="btn">Open the desk <span aria-hidden="true">→</span></button>
        </form>
      )}
    </div>
  );
}

/** Existing gated chat usage. D-293 keeps voice allowances out of parent screens. */
export function MayaChatRow({ name, chat }: { name: string; chat: ChatUsage }) {
  return (
    <div className="acct-desk">
      <span>
        <b>Maya chat today</b>
        <ChatUsageRow name={name} usage={chat} />
      </span>
    </div>
  );
}
