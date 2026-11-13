// The voice call's opening without a model call (Savar, 2026-11-13: "As soon as I start the call, it should say 'Hi
// there, I'm Maya...' right away"). The opening's words are code-written lines already; the model only picked them,
// which took 2 to 4 s. This wrapper answers the opening request itself with the two lines the model always picks
// (open.hello and question.problem), copied from the session's own offers, so the session's checks run as for any
// proposal. Every other request, and a repair of a refused opening, goes to the real model.
//
// Temporary: the conversational build (site/maya-conversational) gives `start({ openingSpoken: true })`, which never
// calls the model. Remove this wrapper when the worker uses that.
import type { MayaModel, ModelInput } from "@/lib/maya-model";

const OPENING_LINES = ["open.hello", "question.problem"] as const;

/** The proposal for the opening, or null when this request is not an untouched opening with both lines on offer. */
export function openingProposal(input: ModelInput): unknown | null {
  if (input.repair || input.childTurn !== null || input.transcript.length > 0) return null;
  const open = input.offers.find(o => o.act === "open");
  if (!open) return null;
  const parts = OPENING_LINES.map(line => open.lines.find(l => l.line === line));
  if (parts.some(p => !p)) return null;
  return {
    version: 2, act: "open", draw: null, step: null, board: null, level: null, reading: null, understanding: null,
    parts: parts.map(p => ({ line: p!.line, slots: { step: null, heard: null, other: null, sentence: null, ...p!.slots } })),
  };
}

export function codeOpening(model: MayaModel): MayaModel {
  return {
    id: model.id,
    promptVersion: model.promptVersion,
    propose: (input, signal) => {
      const opening = openingProposal(input);
      return opening ? Promise.resolve(opening) : model.propose(input, signal);
    },
  };
}
