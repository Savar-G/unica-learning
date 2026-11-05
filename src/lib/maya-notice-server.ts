import "server-only";
import { chatAccess } from "@/lib/maya-chat-server";
import { mayaNotice, noticeDue, type MayaNotice } from "@/lib/maya-notice";
import { noticeStore } from "@/lib/maya-notice-store";
import { adminClient } from "@/lib/supabase-auth";

// The Maya notice (src/lib/maya-notice.ts, #529) on the secret key. Null without the key, and callers then fail closed.
export function serverMayaNotice(): MayaNotice | null {
  const db = adminClient();
  return db && mayaNotice(noticeStore(db));
}

/** Whether to show this family the notice: chat is open to them and they have not agreed. */
export async function mayaNoticeDue(parentId: string): Promise<boolean> {
  const db = adminClient();
  if (!db) return false;
  return noticeDue(parentId, mayaNotice(noticeStore(db)), (parent) => chatAccess(db, parent));
}
