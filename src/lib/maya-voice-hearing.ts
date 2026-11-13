// The child's words on the call screen while Maya hears them (#326 latency work). LiveKit Agents for Node 1.9.5 sends the
// speech-to-text's transcript of the child to the room as text streams on the topic "lk.transcription"
// (`ParticipantTranscriptionOutput` in voice/room_io/_output.js): one complete stream per interim transcript, with
// `lk.transcription_final` "false", and one per final transcript, "true", all of one transcript under one
// `lk.segment_id`, and `lk.transcribed_track_id` set to the child's microphone track. Maya's own words come on the same
// topic with her audio track, and are not shown from here: the call screen shows her words from the saved call.
//
// The heard line is only for the call screen: it is never saved, never sent anywhere, and the saved child turn replaces
// it. Pure functions, so the call room hook (src/components/maya-voice-room.ts) holds no rules of its own.

export const TRANSCRIPTION_TOPIC = "lk.transcription";
export const TRANSCRIPTION_ATTR = { track: "lk.transcribed_track_id", final: "lk.transcription_final", segment: "lk.segment_id" } as const;

/** At most this many characters of one transcript, and this many transcripts on the line, so a stuck stream cannot grow it. */
export const HEARD_MAX_CHARS = 500;
export const HEARD_MAX_SEGMENTS = 6;

export interface HeardSegment {
  id: string;
  text: string;
  final: boolean;
}

/**
 * Whether a transcription stream is the call's own child's words. With a transcribed track named, it must be this
 * device's microphone, sent by the child's identity or by the call's current Maya worker (who publishes it for the
 * child). With none named, only a stream under the child's own identity counts: anything else may be Maya's words.
 */
export function childTranscription(input: {
  identity: string;
  attributes: Readonly<Record<string, string>> | undefined;
  child: string;
  maya: string | null;
  microphone: string | null;
}): boolean {
  const track = input.attributes?.[TRANSCRIPTION_ATTR.track];
  if (track) return !!input.microphone && track === input.microphone && (input.identity === input.child || (input.maya !== null && input.identity === input.maya));
  return input.identity === input.child;
}

/** The segment a stream carries, or null when it has no segment id or no words. */
export function heardSegment(attributes: Readonly<Record<string, string>> | undefined, text: string): HeardSegment | null {
  const id = attributes?.[TRANSCRIPTION_ATTR.segment];
  const words = text.trim().slice(0, HEARD_MAX_CHARS);
  if (!id || !words) return null;
  return { id, text: words, final: attributes?.[TRANSCRIPTION_ATTR.final] === "true" };
}

/**
 * Adds a transcript: a newer text of a known segment replaces it in place (an interim with a later one, or with its
 * final), and a new segment goes last. A final is never turned back into an interim by a late interim.
 */
export function addHeard(line: readonly HeardSegment[], segment: HeardSegment): HeardSegment[] {
  const at = line.findIndex((s) => s.id === segment.id);
  if (at < 0) return [...line, segment].slice(-HEARD_MAX_SEGMENTS);
  if (line[at].final && !segment.final) return [...line];
  return line.map((s, i) => (i === at ? segment : s));
}

/** Drops the final transcripts in `ids`: the saved call now holds the child's turn they were part of. */
export function clearHeard(line: readonly HeardSegment[], ids: ReadonlySet<string>): HeardSegment[] {
  return line.filter((s) => !(s.final && ids.has(s.id)));
}

/** The finals on the line now, to clear once the saved call is read again. */
export function heardFinals(line: readonly HeardSegment[]): Set<string> {
  return new Set(line.filter((s) => s.final).map((s) => s.id));
}

/** The words to show as the child's last bubble, or null. */
export function heardText(line: readonly HeardSegment[]): string | null {
  const text = line.map((s) => s.text).join(" ").trim();
  return text || null;
}
