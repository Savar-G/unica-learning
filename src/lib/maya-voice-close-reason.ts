// LiveKit protocol DisconnectReason values at the installed SDK pin. Never log enum reverse lookups or raw text.
const DISCONNECT_REASONS = [
  "unknown", "client_initiated", "duplicate_identity", "server_shutdown", "participant_removed", "room_deleted",
  "state_mismatch", "join_failure", "migration", "signal_close", "room_closed", "user_unavailable", "user_rejected",
  "sip_trunk_failure", "connection_timeout", "media_failure", "agent_error",
] as const;

export type VoiceDisconnectReason = typeof DISCONNECT_REASONS[number];

export function voiceDisconnectReason(value: unknown): VoiceDisconnectReason {
  return typeof value === "number" && Number.isInteger(value) ? DISCONNECT_REASONS[value] ?? "unknown" : "unknown";
}
