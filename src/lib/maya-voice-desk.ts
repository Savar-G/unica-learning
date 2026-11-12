import type { ChatView } from "@/lib/maya-chat";
import type { VoiceTicket } from "@/lib/maya-voice";

// The child's desk voice call (client-safe types shared by the desk screen and the /api/desk/voice route). The server
// side keeps its own helpers in this same file; keep these exports as they are.
export type { VoiceTicket };
export const VOICE_WEEK_SECONDS = 1800;
export interface VoiceUsage { usedSeconds: number; leftSeconds: number; limitSeconds: number; resetsAt: string; zone: string }
export type DeskVoiceCall = ChatView & { mode: "voice"; started: boolean };
export interface DeskVoiceReply { call: DeskVoiceCall | null; ticket?: VoiceTicket; usage: VoiceUsage | null; error?: string }
