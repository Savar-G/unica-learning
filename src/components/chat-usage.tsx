import type { ChatUsage } from "@/lib/maya-chat";
import { parentSpendLine } from "@/lib/maya-spend";
/** Shared by Parent home and its visual evidence fixture. Maya's spending cap (D-290) adds its line when it has one. */
export function ChatUsageRow({ name, usage }: { name: string; usage: ChatUsage }) {
  const spend = usage.spend ? parentSpendLine(usage.spend, name) : null;
  return <>
    <p className="small">{usage.left > 0
      ? `${name} used ${usage.used} of 60 chat messages today. ${usage.left} left.`
      : `${name} used all 60 chat messages today.`} Chat starts again at {usage.backAt}.</p>
    {spend && <p className="small" role="status">{spend}</p>}
  </>;
}
