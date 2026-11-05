// The parent notice before a child's first chat or call with Maya (#529). One agreement per family and notice version:
// who, when and which version. Server code refuses a chat start and a call token without it (src/lib/maya-chat-server.ts,
// src/lib/maya-voice-token.ts), so hiding a screen is never the only guard.
//
// Who must agree:
// - Every family that chats on the desk, test families too: the notice is one click, and the team tests the real path.
// - Not an admin test call (kind "admin_test"): an admin runs it, with no child and no parent, and the database allows it
//   only for a test family. Any other kind needs the agreement, so a later kind is closed until it is decided.
//
// Seam: the store (Supabase: src/lib/maya-notice-store.ts; memory: src/lib/maya-notice-memory.ts). Pure otherwise.

/** Raise it when the notice changes in an important way (voice calls opening, a new kind of company): every family is asked again. */
export const MAYA_NOTICE_VERSION = "2026-11-05";

/** What the child's desk says when chat is open to the family but no parent agreed. */
export const MAYA_NOTICE_DESK_LINE = "Ask a grown-up to turn on Maya from their account.";

/** The notice as a parent reads it. No company names here: DESIGN.md keeps them in the privacy disclosure. */
export const MAYA_NOTICE: readonly { title: string; text: string }[] = [
  { title: "What Maya does", text: "Your child types a message on the desk. Maya helps with one workbook question, one step at a time, on a shared board. Maya is an AI, not a person, and can make a mistake." },
  { title: "Where your child's words go", text: "We send your child's messages, the question and Maya's recent lines to an AI company, so that the AI can choose what Maya says next. Maya's lines can hold your child's first name. After a chat ends, we can also send the chat to the AI company, so that the AI can pick one sentence for your note. We hide your child's first name there, but other personal details your child typed can remain. We do not send your name, email address or postal code. Please ask your child not to type full names, addresses or phone numbers." },
  { title: "What we keep", text: "We keep each chat, a note about it and a learning record. You can read the note and the whole chat in your account, and we email you a recap each week your child uses Maya, with the newest 10 chats or calls across your family. Our team can read them too. A company that stores our records holds them, and a company that sends our email handles the recap. We delete them with your family account." },
  { title: "If your child may not be safe", text: "If your child writes something that suggests they may not be safe, Maya stops the math and tells your child to talk to a grown-up they trust. Our team gets an alert, and your note says it happened. Maya cannot call for help, and Maya is not an emergency service." },
  { title: "What we do not keep", text: "A chat has no audio. Voice calls are not open yet. We will ask you again before they open." },
  { title: "Limits", text: "Chat is for Grade 3 and up, because it needs typing. Each child can send Maya up to 60 messages a day." },
];

export interface NoticeAcceptance {
  parentId: string;
  version: string;
  acceptedBy: string;
  /** ISO time, set by the store. */
  acceptedAt: string;
}

export interface NoticeStore {
  /** The family's agreement to this version, or null. Throws when it cannot be read. */
  read(parentId: string, version: string): Promise<NoticeAcceptance | null>;
  /** Saves an agreement. The first row at a family and version stays. Throws when it cannot be saved. */
  save(row: { parentId: string; version: string; acceptedBy: string }): Promise<void>;
}

/** Whether a call of this kind needs the family's agreement. Closed by default: only an admin test call does not. */
export const callNeedsNotice = (kind: string) => kind !== "admin_test";

export function mayaNotice(store: NoticeStore, version: string = MAYA_NOTICE_VERSION) {
  return {
    /** The family's agreement to the current version, or null. */
    acceptance: (parentId: string) => store.read(parentId, version),
    /** Whether the family agreed to the current version. Throws when it cannot be read, so a caller fails closed. */
    accepted: async (parentId: string) => (await store.read(parentId, version)) !== null,
    /**
     * Saves the parent's agreement to the text they saw: `seen` is the version on their screen. An older screen saves
     * nothing, so an agreement never covers text the parent did not read.
     */
    async accept(parentId: string, acceptedBy: string, seen: unknown): Promise<"saved" | "old_version"> {
      if (seen !== version) return "old_version";
      await store.save({ parentId, version, acceptedBy });
      return "saved";
    },
  };
}

export type MayaNotice = ReturnType<typeof mayaNotice>;

/**
 * Whether to show a family the notice: Maya is open to them and they have not agreed. The agreement is read first, so a
 * family that agreed never waits for the plan check. A failed read shows no notice: this only chooses a screen, and the
 * server still refuses the chat.
 */
export async function noticeDue(parentId: string, notice: Pick<MayaNotice, "accepted">, mayaOpen: (parentId: string) => Promise<boolean>): Promise<boolean> {
  try {
    return !(await notice.accepted(parentId)) && await mayaOpen(parentId);
  } catch {
    return false;
  }
}
