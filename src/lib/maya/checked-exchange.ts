import type { Command } from "@/lib/board";
import type { OperationPackage } from "@/lib/question-package";

type ActionKind = "show" | "exchange";

export const EXCHANGE_OBJECT = "exchange-before";
export const EXCHANGE_RPC = "maya.exchange";

/** A revision names the lesson board at the time this object was offered. */
export interface ExchangeTarget {
  lessonId: string;
  turnId: string;
  boardRevision: number;
  objectId: typeof EXCHANGE_OBJECT;
  batchId: string;
}

export function readExchangeTarget(value: unknown): ExchangeTarget | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { lessonId, turnId, boardRevision, objectId, batchId } = value as Partial<ExchangeTarget>;
  const id = (field: unknown): field is string => typeof field === "string" && field.length > 0 && field.length <= 160;
  if (!id(lessonId) || !id(turnId) || !id(batchId) || typeof boardRevision !== "number" ||
    !Number.isSafeInteger(boardRevision) || boardRevision < 1 || objectId !== EXCHANGE_OBJECT) return null;
  return { lessonId, turnId, boardRevision, objectId, batchId };
}

export function sameExchangeTarget(a: ExchangeTarget | undefined, b: ExchangeTarget): boolean {
  return !!a && a.lessonId === b.lessonId && a.turnId === b.turnId && a.boardRevision === b.boardRevision &&
    a.objectId === b.objectId && a.batchId === b.batchId;
}

export interface ExchangeAmounts {
  tens: number;
  ones: number;
}

export interface ExchangeFacts {
  value: number;
  before: ExchangeAmounts;
  after: ExchangeAmounts;
  example: boolean;
}

export interface ExchangeAction {
  id: string;
  kind: ActionKind;
  batchId: string;
  after?: string;
  delivery: "generated" | "sent";
  fate?: "shown" | "skipped" | "cancelled";
  presented?: true;
}

export interface ExchangeTurn {
  id: string;
  facts: ExchangeFacts;
  actions: ExchangeAction[];
  playback?: "finished" | "interrupted";
  prompt?: ExchangeTarget;
  childAction?: ExchangeTarget;
}

export interface CheckedExchangeLesson {
  version: 1;
  id: string;
  turns: ExchangeTurn[];
}

export interface ExchangeProposal {
  checkedExchange: 1;
  value: number;
  example: boolean;
  show: boolean;
  prompt?: true;
  childAction?: ExchangeTarget;
  afterFailure?: true;
}

export function supportsCheckedExchange(pkg: OperationPackage): boolean {
  if (pkg.operation.kind !== "subtract" || pkg.answer.value.type !== "number" || pkg.answer.unit !== null) return false;
  const [top, bottom] = pkg.operation.operands;
  return exchangeFacts(top, false) !== null && Number.isInteger(bottom) && bottom > 0 &&
    top > bottom && top % 10 < bottom % 10 && pkg.answer.value.value === top - bottom;
}

/** Check the place values, the single exchange and the value of both representations. */
export function exchangeFacts(value: number, example: boolean): ExchangeFacts | null {
  if (!Number.isInteger(value) || value < 10 || value > 99) return null;
  const before = { tens: Math.floor(value / 10), ones: value % 10 };
  const after = { tens: before.tens - 1, ones: before.ones + 10 };
  if (10 * before.tens + before.ones !== value || 10 * after.tens + after.ones !== value) return null;
  return { value, before, after, example };
}

export function exchangeWords(facts: ExchangeFacts, show: boolean): string[] {
  const { value, before, after, example } = facts;
  const groups = ({ tens, ones }: ExchangeAmounts) => `${tens} ${tens === 1 ? "ten" : "tens"} and ${ones} ${ones === 1 ? "one" : "ones"}`;
  return [
    ...(show ? [`${example ? "Use a separate example: " : ""}${value} is ${groups(before)}.`] : []),
    "Trade 1 ten for 10 ones.",
    `Now we have ${groups(after)}, which is still ${value}.`,
    "What changed when we traded a ten?",
  ];
}

export function exchangePromptWords(facts: ExchangeFacts, show: boolean): string[] {
  return [
    ...(show ? exchangeWords(facts, true).slice(0, 1) : []),
    "Trade one ten for ten ones. Use the Exchange one ten button on the board.",
  ];
}

export function exchangeChildWords(facts: ExchangeFacts): string[] {
  return [...exchangeWords(facts, false).slice(1, 2), "What changed when you traded a ten?"];
}

function notation(value: number, { tens, ones }: ExchangeAmounts): string {
  return `${value} = ${tens * 10} + ${ones}`;
}

export function exchangeCommands(action: ActionKind, facts: ExchangeFacts): Command[] {
  if (action === "show") return [
    { op: "model", id: EXCHANGE_OBJECT, model: { kind: "base_ten", hundreds: 0, ...facts.before }, place: { region: "main" } },
    { op: "write", id: "exchange-before-notation", text: notation(facts.value, facts.before), place: { below: EXCHANGE_OBJECT } },
    { op: "focus", target: { objectId: EXCHANGE_OBJECT, part: "piece", piece: `ten-${facts.before.tens}` } },
  ];
  return [
    { op: "remove", objectId: "exchange-before-notation" },
    { op: "remove", objectId: EXCHANGE_OBJECT },
    { op: "model", id: "exchange-after", model: { kind: "base_ten", hundreds: 0, ...facts.after }, place: { region: "main" } },
    { op: "write", id: "exchange-after-notation", text: notation(facts.value, facts.after), place: { below: "exchange-after" } },
  ];
}
