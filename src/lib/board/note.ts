// A short note or simple equation Maya writes on the board ("27 + 39 = 66"), one character per cell. Words are targets
// by index, so a repeated word or number stays distinct.
import { glyphStrokes, missingGlyphs, refuse, type Representation } from "@/lib/board/representation";
import type { Ink, Rect, WriteCommand } from "@/lib/board/types";

export interface NoteState {
  text: string;
  ink: Ink;
  seq: number;
}

/** Each word's first character index and length. */
function words(text: string): { start: number; length: number }[] {
  const out: { start: number; length: number }[] = [];
  for (const m of text.matchAll(/\S+/g)) out.push({ start: m.index, length: m[0].length });
  return out;
}

export const note: Representation<NoteState, WriteCommand> = {
  op: "write",
  create(cmd, ctx) {
    const missing = missingGlyphs(ctx.glyphs, cmd.text);
    if (missing.length > 0) return refuse("unsupported", `The board pen cannot write ${missing.map((c) => `"${c}"`).join(", ")} yet.`);
    if (cmd.text.trim() === "") return refuse("invalid_command", "A note needs text.");
    return { state: { text: cmd.text, ink: cmd.ink ?? "blue", seq: ctx.seq }, size: { w: cmd.text.length, h: 1 } };
  },
  targets(state, objectId) {
    const whole: Rect = { x: 0, y: 0, w: state.text.length, h: 1 };
    return [
      { target: { objectId, part: "whole" }, label: objectId, writable: false, value: state.text, rect: whole },
      ...words(state.text).map((w, index) => ({
        target: { objectId, part: "word" as const, index },
        label: `${objectId} word ${index + 1}`,
        writable: false,
        value: state.text.slice(w.start, w.start + w.length),
        rect: { x: w.start, y: 0, w: w.length, h: 1 },
      })),
    ];
  },
  draw(state, objectId, ctx) {
    return glyphStrokes(
      ctx.glyphs,
      state.text,
      { x: 0, y: 0, w: state.text.length, h: 1 },
      { objectId, target: { objectId, part: "whole" }, layer: "math", ink: state.ink, width: 0.07, seq: state.seq },
      "text",
    );
  },
};
