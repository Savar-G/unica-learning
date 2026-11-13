// The voice call's opening without a model call (Savar, 2026-11-13: "As soon as I start the call, it should say 'Hi
// there, I'm Maya...' right away"). The opening's words are code-written lines already; the model only picked them,
// which took 2 to 4 s. This wrapper answers the opening request itself with the two lines the model always picks
// (open.hello and question.problem), copied from the session's own offers, so the session's checks run as for any
// proposal. Every other request, and a repair of a refused opening, goes to the real model.
//
// Temporary: the conversational build (site/maya-conversational) gives `start({ openingSpoken: true })`, which never
// calls the model. Remove this wrapper when the worker uses that.
import type { Session } from "@/lib/maya";
import { workbookOpening } from "@/lib/maya/lines";
import type { MayaModel, ModelInput } from "@/lib/maya-model";
import { operationText } from "@/lib/question-package";

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

/**
 * The opening the worker speaks the moment the child is connected, or null when the call's own start must give the
 * words (a call already started, or a question with no operation). A workbook call keeps its fixed confirmation line,
 * which the session forces for its opening too, so the spoken and the recorded words are the same. Every other call
 * gets Savar's approved line (2026-11-12). Temporary, like `codeOpening`: `openingLine(pkg)` of the conversational
 * build replaces both.
 */
export function voiceOpening(session: Session): string | null {
  const pkg = session.package;
  if (!pkg || session.startedAt !== null || !("operation" in pkg)) return null;
  // The Chief of Staff's wording for a workbook call (2026-11-13): the page and number check stays in the opening.
  if (session.confirmWorkbook && pkg.ref.source === "workbook") return `Hi there! I'm Maya, an AI math helper. We're doing page ${pkg.ref.page}, number ${pkg.ref.question} today: ${operationText(pkg.operation)}.`;
  if (session.confirmWorkbook) return workbookOpening(pkg);
  return `Hi there! I'm Maya, an AI math helper. We're doing ${operationText(pkg.operation)} today.`;
}
