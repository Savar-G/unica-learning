// Maya's teaching controller (#321, spec #297): the one tested seam. Import from "@/lib/maya" only.
// Pure TypeScript: no React, DOM, network, clock or randomness. The text adapter, voice and storage live elsewhere.
// Since #372 (D-195) every sentence of math Maya says or writes is a code-written line (lines.ts); the model picks
// lines from lineOffers and may add warm talk, which talkMath checks.
export {
  createSession,
  learningEvent,
  lineOffers,
  nextActs,
  step,
  ASSISTANCE,
  INTERRUPTS,
  MAIN_STATES,
  PAUSES,
  SAFETY_GUIDANCE,
  TEACHABLE_KINDS,
  TIME_LIMITS,
  type Assistance,
  type Effect,
  type Expect,
  type Interrupt,
  type MainState,
  type Outcome,
  type PaperStatus,
  type Problem,
  type Reason,
  type Refusal,
  type RefusalCode,
  type Session,
  type SessionEvent,
  type SessionState,
  type StepResult,
  type TranscriptTurn,
  type Understanding,
} from "./session";
export {
  ACTS,
  PART_LIMITS,
  PROPOSAL_SCHEMA,
  PROPOSAL_VERSION,
  withoutNulls,
  type Act,
  type ChildAnswer,
  type HintLevel,
  type Part,
  type Proposal,
  type Reading,
  type Severity,
  type Talk,
} from "./proposal";
export { allLineTexts, LINE_IDS, LINES_VERSION, TEMPLATES, type LineChoice, type LineId, type LineOffer, type Slots, type TemplateKey } from "./lines";
export { talkMath } from "./claims";
export { speechKey } from "./speech";
export { readNumbers, valuesIn, type NumbersRead } from "./numbers";
