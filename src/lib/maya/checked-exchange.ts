import type { Command } from "@/lib/board";
import type { OperationPackage } from "@/lib/question-package";

type ActionKind = "show" | "exchange";

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

function notation(value: number, { tens, ones }: ExchangeAmounts): string {
  return `${value} = ${tens * 10} + ${ones}`;
}

export function exchangeCommands(action: ActionKind, facts: ExchangeFacts): Command[] {
  if (action === "show") return [
    { op: "model", id: "exchange-before", model: { kind: "base_ten", hundreds: 0, ...facts.before }, place: { region: "main" } },
    { op: "write", id: "exchange-before-notation", text: notation(facts.value, facts.before), place: { below: "exchange-before" } },
    { op: "focus", target: { objectId: "exchange-before", part: "piece", piece: `ten-${facts.before.tens}` } },
  ];
  return [
    { op: "remove", objectId: "exchange-before-notation" },
    { op: "remove", objectId: "exchange-before" },
    { op: "model", id: "exchange-after", model: { kind: "base_ten", hundreds: 0, ...facts.after }, place: { region: "main" } },
    { op: "write", id: "exchange-after-notation", text: notation(facts.value, facts.after), place: { below: "exchange-after" } },
  ];
}
