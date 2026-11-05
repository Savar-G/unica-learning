import Link from "next/link";
import { ChatUsageRow } from "@/components/chat-usage";
import type { ChatUsage } from "@/lib/maya-chat";
import { WEEK_SECONDS } from "@/lib/maya-minutes";
import type { ChildMinutes } from "@/lib/maya-minutes-server";
import type { WorkbookSummary } from "@/lib/workbook-content";

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

/** The child's minutes with Maya this week (#330): used, left, and the day they come back. */
export function MinutesRow({ name, minutes, chat }: { name: string; minutes?: ChildMinutes; chat?: ChatUsage }) {
  const week = WEEK_SECONDS / 60;
  return (
    <div className="acct-desk">
      <span>
        <b>Maya this week</b>
        {minutes && <span className="small">{minutes.left > 0
          ? `${name} used ${minutes.used} of ${week} minutes. ${minutes.left} ${minutes.left === 1 ? "minute" : "minutes"} left. The minutes start again on ${minutes.backOn}.`
          : `${name} used all ${week} minutes. Maya is back on ${minutes.backOn}.`}</span>}
        {chat && <ChatUsageRow name={name} usage={chat} />}
      </span>
    </div>
  );
}
