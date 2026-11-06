"use client";
import Link from "next/link";
import { feedbackLink } from "@/lib/feedback";
import { usePathname } from "next/navigation";

/** Legacy parent pages retain the same entry point when the dashboard frame is not enabled. */
export function AccountFeedbackLink() {
  const path = usePathname();
  if (!path?.startsWith("/account") || /^\/account\/(test|start)(\/|$)/.test(path)) return null;
  return <Link href={feedbackLink(path)} aria-current={path === "/account/feedback" ? "page" : undefined}>Feedback</Link>;
}
