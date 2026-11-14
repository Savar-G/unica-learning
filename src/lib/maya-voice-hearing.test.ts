import { describe, expect, it } from "vitest";
import { addHeard, childTranscription, clearHeard, HEARD_MAX_CHARS, HEARD_MAX_SEGMENTS, heardFinals, heardSegment, heardText, TRANSCRIPTION_ATTR, type HeardSegment } from "@/lib/maya-voice-hearing";

const CHILD = "child-22222222-2222-4222-8222-222222222222";
const MAYA = "agent-AJ_1";
const MIC = "TR_mic";
const attrs = (segment: string, final: boolean, track: string | null = MIC) => ({
  [TRANSCRIPTION_ATTR.segment]: segment,
  [TRANSCRIPTION_ATTR.final]: String(final),
  ...(track ? { [TRANSCRIPTION_ATTR.track]: track } : {}),
});

describe("whose transcription a stream is", () => {
  const who = (identity: string, attributes: Record<string, string> | undefined, maya: string | null = MAYA, microphone: string | null = MIC) =>
    childTranscription({ identity, attributes, child: CHILD, maya, microphone });

  it("is the child's when it names this device's microphone, from the child's identity or the call's Maya", () => {
    expect(who(CHILD, attrs("SG_1", false))).toBe(true);
    expect(who(MAYA, attrs("SG_1", false))).toBe(true);
  });

  it("is not the child's for Maya's own words, another track, another sender or an unknown microphone", () => {
    expect(who(MAYA, attrs("SG_1", false, "TR_maya_audio"))).toBe(false);
    expect(who("agent-old", attrs("SG_1", false))).toBe(false);
    expect(who("someone-else", attrs("SG_1", false))).toBe(false);
    expect(who(CHILD, attrs("SG_1", false), MAYA, null)).toBe(false);
    expect(who(MAYA, attrs("SG_1", false), null)).toBe(false);
  });

  it("with no track named, is the child's only under the child's own identity", () => {
    expect(who(CHILD, attrs("SG_1", false, null))).toBe(true);
    expect(who(MAYA, attrs("SG_1", false, null))).toBe(false);
    expect(who(MAYA, undefined)).toBe(false);
  });
});

describe("the heard line", () => {
  const seg = (id: string, text: string, final = false) => heardSegment(attrs(id, final), text)!;

  it("shows interim words as they come, then the final in their place", () => {
    let line: HeardSegment[] = [];
    line = addHeard(line, seg("SG_1", "I got"));
    expect(heardText(line)).toBe("I got");
    line = addHeard(line, seg("SG_1", "I got fifty"));
    expect(heardText(line)).toBe("I got fifty");
    line = addHeard(line, seg("SG_1", "I got 56.", true));
    expect(heardText(line)).toBe("I got 56.");
    // A late interim of the same transcript does not undo its final.
    line = addHeard(line, seg("SG_1", "I got fif"));
    expect(heardText(line)).toBe("I got 56.");
  });

  it("joins the transcripts of one turn in order, and the saved turn clears only the finals seen before it", () => {
    let line: HeardSegment[] = [];
    line = addHeard(line, seg("SG_1", "fifty", true));
    line = addHeard(line, seg("SG_2", "six", true));
    expect(heardText(line)).toBe("fifty six");
    const read = heardFinals(line);
    // The child goes on while the saved call is read: those words stay.
    line = addHeard(line, seg("SG_3", "is it"));
    line = clearHeard(line, read);
    expect(heardText(line)).toBe("is it");
    expect(clearHeard(line, new Set(["SG_3"]))).toEqual(line);
  });

  it("holds no empty transcript, no transcript without a segment, and bounded words", () => {
    expect(heardSegment(attrs("SG_1", false), "   ")).toBeNull();
    expect(heardSegment({ [TRANSCRIPTION_ATTR.final]: "true" }, "hello")).toBeNull();
    expect(heardSegment(attrs("SG_1", false), "a".repeat(HEARD_MAX_CHARS + 50))!.text).toHaveLength(HEARD_MAX_CHARS);
    let line: HeardSegment[] = [];
    for (let i = 0; i < HEARD_MAX_SEGMENTS + 3; i++) line = addHeard(line, seg(`SG_${i}`, `w${i}`));
    expect(line).toHaveLength(HEARD_MAX_SEGMENTS);
    expect(line[0].text).toBe("w3");
    expect(heardText([])).toBeNull();
  });
});
