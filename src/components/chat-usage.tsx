import type { ChatUsage } from "@/lib/maya-chat";
/** Shared by Parent home and its visual evidence fixture. */
export function ChatUsageRow({ name, usage }: { name: string; usage: ChatUsage }) {
  return <p className="small">{usage.left > 0
    ? `${name} used ${usage.used} of 60 chat messages today. ${usage.left} left.`
    : `${name} used all 60 chat messages today.`} Chat starts again at {usage.backAt}.</p>;
}
