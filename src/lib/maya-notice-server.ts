import "server-only";
import { chatGate, parentChatChildren } from "@/lib/maya-chat-server";
import { mayaNotice, noticeDue, type MayaNotice } from "@/lib/maya-notice";
import { noticeStore } from "@/lib/maya-notice-store";
import { adminClient } from "@/lib/supabase-auth";

// The Maya notice (src/lib/maya-notice.ts, #529) on the secret key. Null without the key, and callers then fail closed.
export function serverMayaNotice(): MayaNotice | null {
  const db = adminClient();
  return db && mayaNotice(noticeStore(db));
}

/**
 * Whether to show this family the notice: chat is open to a child of this grade and no one has agreed. A family with
 * only younger children cannot chat, so it is not asked yet. A child of the desk passes their grade; Parent home passes
 * the family's children, so a plan that opens one child is not read against a sibling's grade.
 */
export async function mayaNoticeDue(parentId: string, grade: number | null | undefined, child?: string): Promise<boolean> {
  const db = adminClient();
  if (!db) return false;
  return noticeDue(parentId, mayaNotice(noticeStore(db)), async (parent) => await chatGate(db, parent, grade, child) === "open");
}

/** The same, for Parent home: chat is open to any of the family's children. */
export async function mayaNoticeDueForFamily(parentId: string, children: readonly { id: string; grade: number }[]): Promise<boolean> {
  const db = adminClient();
  if (!db) return false;
  return noticeDue(parentId, mayaNotice(noticeStore(db)), async (parent) => (await parentChatChildren(db, parent, children)).size > 0);
}
