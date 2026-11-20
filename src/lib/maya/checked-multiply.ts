import type { Command } from "@/lib/board";
import { workedSteps, type OperationPackage } from "@/lib/question-package";
import { GROUPS_OBJECT, type ExchangeAction, type ExchangeTarget } from "./checked-exchange";
import { TRANSFER_GOODBYE, TRANSFER_OFFER, type TransferOperands } from "./transfer";

export { GROUPS_OBJECT };

export type VisualSupport = "full" | "partial" | "faded";

/** Reviewed multiplication lesson map (#1154, spec #1137). */
export const MULTIPLY_LESSON_MAP = {
  id: "multiplication-equal-groups-arrays",
  prerequisites: ["equal_groups", "repeated_addition"] as const,
  commonMistakes: [
    "additive_error",
    "swapped_factors",
    "off_by_one_group",
    "wrong_unit",
  ] as const,
  representations: ["equal_groups", "array", "linked_notation"] as const,
  examples: {
    worked: "separate_small_array",
    partial: "partial_array_child_adds_equal_groups",
  },
  visualFading: ["full", "partial", "faded"] as const,
  transferTask: "independent_related_product_cleared_board",
} as const;

export interface MultiplyContext {
  groups: number;
  size: number;
  contextual: boolean;
  groupNoun: string;
  groupSingular: string;
  itemNoun: string | null;
  unit: string | null;
}

export interface MultiplyFacts {
  groups: number;
  size: number;
  product: number;
  builtGroups: number;
  example: boolean;
  visualSupport: VisualSupport;
  context: MultiplyContext;
}

export type MultiplyBoardKind = "show" | "replace" | "add_group" | "complete_example" | "question";

export interface MultiplyAction {
  id: string;
  kind: MultiplyBoardKind;
  batchId: string;
  after?: string;
  delivery: "generated" | "sent";
  fate?: "shown" | "skipped" | "cancelled";
  presented?: true;
}

export type MultiplyStep =
  | "check_groups"
  | "check_meaning"
  | "independent"
  | "worked_example"
  | "guide_groups"
  | "additive_error"
  | "swapped_factors"
  | "off_by_one"
  | "group_added"
  | "connect_notation"
  | "skip_count"
  | "wrong_unit"
  | "correct"
  | "offer"
  | "decline"
  | "transfer"
  | "transfer_retry"
  | "transfer_hint"
  | "transfer_show"
  | "transfer_correct";

export interface MultiplyInstruction {
  step: MultiplyStep;
  transfer?: TransferOperands;
}

export type MultiplySkill =
  | "equal_groups"
  | "repeated_addition"
  | "group_structure"
  | "build_group"
  | "product"
  | "additive_error"
  | "swapped_factors"
  | "off_by_one_group"
  | "unit_missing";

export interface MultiplyObservation {
  skill: MultiplySkill;
  result: "correct" | "incorrect";
  assistance: "independent" | "hinted" | "demonstrated" | "uncertain";
  at: number;
}

export interface MultiplyTurn {
  id: string;
  facts: MultiplyFacts;
  actions: MultiplyAction[];
  sent?: true;
  playback?: "finished" | "interrupted";
  prompt?: ExchangeTarget;
  childAction?: ExchangeTarget;
  instruction: MultiplyInstruction;
  support?: "hinted" | "demonstrated";
  observation?: MultiplyObservation;
  transfer?: true;
}

export interface MultiplyTransferTask {
  operands: TransferOperands;
  state: "offered" | "declined" | "started" | "finished";
  done: ("groups" | "product")[];
  startedAt?: number;
  eventKey?: string;
}

export interface CheckedMultiplyLesson {
  version: 1;
  transfers: 1;
  id: string;
  context: MultiplyContext;
  visualSupport: VisualSupport;
  builtGroups: number;
  turns: MultiplyTurn[];
  transfer?: MultiplyTransferTask;
}

export interface MultiplyProposal {
  checkedMultiply: 1;
  groups: number;
  size: number;
  builtGroups: number;
  example: boolean;
  visualSupport: VisualSupport;
  context: MultiplyContext;
  show: boolean;
  boardCount: number;
  prompt?: true;
  childAction?: ExchangeTarget;
  afterFailure?: true;
  instruction: MultiplyInstruction;
}

/** Related multiplication tasks for checked transfer (#1154). */
export const MULTIPLY_TRANSFER_CANDIDATES: readonly TransferOperands[] = [
  [4, 6],
  [3, 7],
  [5, 4],
  [6, 3],
  [4, 7],
  [3, 5],
  [6, 4],
  [5, 3],
  [7, 4],
  [3, 8],
];

/** Small separate worked-example candidates (rows x columns). */
export const MULTIPLY_EXAMPLE_CANDIDATES: readonly TransferOperands[] = [
  [2, 3],
  [2, 4],
  [3, 2],
  [2, 5],
  [3, 5],
  [2, 6],
];

const AREA_UNIT_WORDS: Record<string, string> = {
  "mm²": "square millimetres",
  "cm²": "square centimetres",
  "m²": "square metres",
  "km²": "square kilometres",
};

const MEASURE_UNIT_WORDS: Record<string, string> = {
  ...AREA_UNIT_WORDS,
  mm: "millimetres",
  cm: "centimetres",
  m: "metres",
  km: "kilometres",
  g: "grams",
  kg: "kilograms",
  mL: "millilitres",
  L: "litres",
};

const GROUP_SINGULAR: Record<string, string> = {
  group: "group", groups: "group",
  row: "row", rows: "row",
  bag: "bag", bags: "bag",
  box: "box", boxes: "box",
  pack: "pack", packs: "pack",
  bin: "bin", bins: "bin",
  jar: "jar", jars: "jar",
  basket: "basket", baskets: "basket",
  tray: "tray", trays: "tray",
  plate: "plate", plates: "plate",
  crate: "crate", crates: "crate",
  bundle: "bundle", bundles: "bundle",
  carton: "carton", cartons: "carton",
  shelf: "shelf", shelves: "shelf",
  team: "team", teams: "team",
  table: "table", tables: "table",
  bus: "bus", buses: "bus",
  van: "van", vans: "van",
};

const GROUP_PLURAL: Record<string, string> = {
  group: "groups", row: "rows", bag: "bags", box: "boxes", pack: "packs", bin: "bins", jar: "jars",
  basket: "baskets", tray: "trays", plate: "plates", crate: "crates", bundle: "bundles", carton: "cartons",
  shelf: "shelves", team: "teams", table: "tables", bus: "buses", van: "vans",
};

const GROUP_PATTERN = Object.keys(GROUP_SINGULAR).sort((a, b) => b.length - a.length).join("|");
const ITEM_STOP = new Set(["in", "on", "at", "of", "for", "with", "each", "every", "per", "altogether", "total", "all", "are", "is", "there", "and", "to", "from", "by", "can", "carry", "hold"]);

const DIVISION_OR_OTHER_STORY = /\b(?:cut|cuts|piece|pieces|share|shares|shared|sharing|split|splits|equally|divide|divides|divided|left over|leftover|removes?|removed|takes? away|took away|more than|fewer than|less than|die|dice|roll|rolls|spinner|likely|chance)\b/i;

function cleanItemNoun(raw: string): string | null {
  const words = raw.toLowerCase().replace(/[^a-z\s]/g, " ").trim().split(/\s+/).filter(Boolean);
  while (words.length > 0 && ITEM_STOP.has(words[words.length - 1])) words.pop();
  while (words.length > 0 && ITEM_STOP.has(words[0])) words.shift();
  const kept = words.slice(0, 2).join(" ");
  if (!kept || kept in GROUP_SINGULAR) return null;
  return kept;
}

function questionItemNoun(text: string): string | null {
  const m = /\bhow many ([a-z]+(?:\s+[a-z]+)?)\s+(?:are|is|do|does|did|can|in|altogether|total)\b/i.exec(text);
  return m ? cleanItemNoun(m[1]) : null;
}

function otherFactor(a: number, b: number, known: number): number | null {
  if (known === a) return b;
  if (known === b) return a;
  return null;
}

export function unitDisplay(unit: string | null): string | null {
  if (!unit) return null;
  return MEASURE_UNIT_WORDS[unit] ?? unit;
}

/**
 * Extracts unambiguous equal-groups/array structure from a multiplication package.
 * In contextual word problems, `groups` is always the container/row count and `size` is items per group,
 * regardless of operand order in `pkg.operation.operands`.
 */
export function multiplyContext(pkg: OperationPackage): MultiplyContext | null {
  if (pkg.operation.kind !== "multiply" || pkg.answer.value.type !== "number") return null;
  const [a, b] = pkg.operation.operands;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 2 || a > 10 || b < 2 || b > 10) return null;
  if (pkg.answer.value.value !== a * b) return null;
  const unit = pkg.answer.unit;
  const text = pkg.text.replace(/\s+/g, " ").trim();

  // Plain equation: "3 × 4 = ?" or "3 x 4 = ?"
  const plain = /^(\d+)\s*[×x*]\s*(\d+)\s*=\s*\?$/i.exec(text);
  if (plain) {
    const x = Number(plain[1]);
    const y = Number(plain[2]);
    if ((x === a && y === b) || (x === b && y === a)) {
      return { groups: x, size: y, contextual: false, groupNoun: "groups", groupSingular: "group", itemNoun: null, unit };
    }
    return null;
  }

  if (DIVISION_OR_OTHER_STORY.test(text)) return null;

  // Contextual equal-groups / array story: ensure only the two factors appear as numbers.
  const nums = [...text.matchAll(/(?<![\d.])\d+(?![\d.])/g)].map((m) => Number(m[0]));
  if (nums.length < 2 || !nums.includes(a) || !nums.includes(b) || !nums.every((n) => n === a || n === b)) return null;
  const askedItem = questionItemNoun(text);

  // Pattern 1: "3 bags with 4 apples", "3 packs of 4 books", "3 rows of 4 chairs"
  const p1 = new RegExp(String.raw`\b(\d+)\s+(${GROUP_PATTERN})\s+(?:of|with)\s+(\d+)\s+([a-z]+(?:\s+[a-z]+)?)\b`, "i").exec(text);
  if (p1) {
    const groups = Number(p1[1]);
    const size = Number(p1[3]);
    if (otherFactor(a, b, groups) === size) {
      const singular = GROUP_SINGULAR[p1[2].toLowerCase()];
      const itemNoun = askedItem ?? cleanItemNoun(p1[4]);
      return { groups, size, contextual: true, groupNoun: GROUP_PLURAL[singular], groupSingular: singular, itemNoun, unit };
    }
  }

  // Pattern 2: "Each jar has 4 toy cars. Amara has 3 of them." / "A tray holds 4 muffins. There are 3 trays."
  const p2 = new RegExp(String.raw`\b(?:each|every|a|one)\s+(${GROUP_PATTERN})\s+(?:has|holds|carries|contains|gets)\s+(\d+)\s+([a-z]+(?:\s+[a-z]+)?)\b`, "i").exec(text);
  if (p2) {
    const size = Number(p2[2]);
    const groups = otherFactor(a, b, size);
    if (groups !== null) {
      const singular = GROUP_SINGULAR[p2[1].toLowerCase()];
      const itemNoun = askedItem ?? cleanItemNoun(p2[3]);
      return { groups, size, contextual: true, groupNoun: GROUP_PLURAL[singular], groupSingular: singular, itemNoun, unit };
    }
  }

  // Pattern 3: "puts 4 muffins on each tray" / "4 apples in each bag"
  const p3 = new RegExp(String.raw`\b(\d+)\s+([a-z]+(?:\s+[a-z]+)?)\s+(?:in|on|into|per)\s+(?:each|every)\s+(${GROUP_PATTERN})\b`, "i").exec(text);
  if (p3) {
    const size = Number(p3[1]);
    const groups = otherFactor(a, b, size);
    if (groups !== null) {
      const singular = GROUP_SINGULAR[p3[3].toLowerCase()];
      const itemNoun = askedItem ?? cleanItemNoun(p3[2]);
      return { groups, size, contextual: true, groupNoun: GROUP_PLURAL[singular], groupSingular: singular, itemNoun, unit };
    }
  }

  return null;
}

export function supportsCheckedMultiply(pkg: OperationPackage): boolean {
  return multiplyContext(pkg) !== null;
}

export function isValidMultiplyContext(raw: unknown): raw is MultiplyContext {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const c = raw as Partial<MultiplyContext>;
  return Number.isInteger(c.groups) && c.groups! >= 2 && c.groups! <= 10 &&
    Number.isInteger(c.size) && c.size! >= 2 && c.size! <= 10 &&
    typeof c.contextual === "boolean" &&
    typeof c.groupNoun === "string" && c.groupNoun.length > 0 && c.groupNoun.length <= 40 &&
    typeof c.groupSingular === "string" && c.groupSingular.length > 0 && c.groupSingular.length <= 40 &&
    (c.itemNoun === null || (typeof c.itemNoun === "string" && c.itemNoun.length > 0 && c.itemNoun.length <= 40)) &&
    (c.unit === null || (typeof c.unit === "string" && c.unit.length > 0 && c.unit.length <= 40));
}

export function multiplyFacts(
  groups: number,
  size: number,
  builtGroups: number,
  example: boolean,
  visualSupport: VisualSupport,
  context: MultiplyContext,
): MultiplyFacts | null {
  if (!Number.isInteger(groups) || groups < 2 || groups > 10) return null;
  if (!Number.isInteger(size) || size < 2 || size > 10) return null;
  if (!Number.isInteger(builtGroups) || builtGroups < 0 || builtGroups > groups) return null;
  if (visualSupport !== "full" && visualSupport !== "partial" && visualSupport !== "faded") return null;
  if (!isValidMultiplyContext(context)) return null;
  const product = groups * size;
  return { groups, size, product, builtGroups, example, visualSupport, context };
}

export function initialPartialGroups(groups: number): number {
  return Math.max(1, groups - 2);
}

export function multiplyOffersAction(instruction: MultiplyInstruction | undefined, builtGroups: number, groups: number): boolean {
  if (!instruction || builtGroups >= groups) return false;
  return instruction.step === "guide_groups" || instruction.step === "additive_error" ||
    instruction.step === "swapped_factors" || instruction.step === "off_by_one" || instruction.step === "group_added";
}

function repeatedSum(count: number, size: number): string {
  return Array.from({ length: count }, () => String(size)).join(" + ");
}

function notationText(facts: MultiplyFacts): string {
  const { groups, size, builtGroups, example, product } = facts;
  if (example && builtGroups === groups) return `${groups} × ${size} = ${product}`;
  if (builtGroups === groups) return `${groups} × ${size} = ?`;
  if (builtGroups <= 1) return `1 × ${size} = ${size}`;
  return `${repeatedSum(builtGroups, size)} = ${builtGroups * size}`;
}

export function multiplyCommands(kind: Exclude<MultiplyBoardKind, "question">, facts: MultiplyFacts): Command[] {
  const rows = kind === "complete_example" ? facts.groups : Math.max(1, facts.builtGroups);
  const drawFacts = kind === "complete_example" ? { ...facts, builtGroups: facts.groups } : facts;
  const base: Command[] = [
    ...(kind === "show" ? [] : [
      { op: "remove" as const, objectId: "multiply-notation" },
      { op: "remove" as const, objectId: GROUPS_OBJECT },
    ]),
    { op: "model", id: GROUPS_OBJECT, model: { kind: "array", rows, columns: facts.size }, place: { region: "main" } },
    { op: "write", id: "multiply-notation", text: notationText(drawFacts), place: { below: GROUPS_OBJECT } },
  ];
  if (kind !== "complete_example") {
    base.push({
      op: "focus",
      target: rows === facts.groups
        ? { objectId: GROUPS_OBJECT, part: "whole" }
        : { objectId: GROUPS_OBJECT, part: "piece", piece: `row-${rows}` },
    });
  }
  return base;
}

export function multiplyTransferBoard([groups, size]: TransferOperands): Command[] {
  return [
    { op: "clear", scope: "maya_objects" },
    { op: "write", id: "transfer-question", text: `${groups} × ${size} = ?`, place: { region: "main" } },
  ];
}

export function multiplyTransferPackage(pkg: OperationPackage, [groups, size]: TransferOperands): OperationPackage {
  const operation = { kind: "multiply" as const, operands: [groups, size] as [number, number] };
  return {
    ...pkg,
    id: `${pkg.id}:transfer`,
    text: `${groups} × ${size} = ?`,
    answer: { value: { type: "number", value: groups * size }, accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    wrongAnswers: [],
  };
}

export function readMultiplyTransferOperands(value: unknown): TransferOperands | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [g, s] = value;
  return MULTIPLY_TRANSFER_CANDIDATES.some((c) => c[0] === g && c[1] === s) ? [g, s] : null;
}

export function chooseMultiplyTransfer(
  original: TransferOperands,
  worked: readonly TransferOperands[],
  disclosed: (operands: TransferOperands) => boolean,
): TransferOperands | null {
  const product = original[0] * original[1];
  const samePair = (a: TransferOperands, b: TransferOperands) =>
    (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);
  return MULTIPLY_TRANSFER_CANDIDATES.find((candidate) =>
    !samePair(candidate, original) &&
    candidate[0] * candidate[1] !== product &&
    !worked.some((w) => samePair(w, candidate)) &&
    !disclosed(candidate),
  ) ?? null;
}

/** Code-owned prompts for every checked multiplication step. */
export function multiplyWords(facts: MultiplyFacts, instruction: unknown, show: boolean): string[] | null {
  if (!instruction || typeof instruction !== "object") return null;
  const { step, transfer } = instruction as MultiplyInstruction;
  const related = transfer === undefined ? null : readMultiplyTransferOperands(transfer);
  if (transfer !== undefined && (!related || related[0] !== facts.groups || related[1] !== facts.size || facts.example)) return null;

  const { groups, size, builtGroups, context } = facts;
  const gNoun = context.groupNoun;
  const gSing = context.groupSingular;
  const gWord = (n: number) => (n === 1 ? gSing : gNoun);
  const items = context.itemNoun;
  const unitName = unitDisplay(context.unit);
  const thingInGroup = items ? `${size} ${items}` : `${size}`;
  const totalAsk = items
    ? `How many ${items} are there in all?`
    : unitName
      ? `What is the product in ${unitName}?`
      : "What is the product?";
  const canAddGroup = builtGroups < groups;
  const nextActionLines = canAddGroup
    ? [
        ...(show ? [`Start with ${builtGroups} ${gWord(builtGroups)} of ${size}.`] : []),
        `Use the Add 1 group of ${size} button on the board.`,
      ]
    : [`Count all ${groups} rows of ${size} on the board.`, totalAsk];

  switch (step) {
    case "check_groups":
      if (context.contextual && items) {
        return [`How many ${gNoun} are there, and how many ${items} are in each ${gSing}?`];
      }
      return [`In ${groups} times ${size}, how many equal ${gNoun} are there, and how many are in each ${gSing}?`];

    case "check_meaning":
      return [`How can you find the total for ${groups} ${gNoun} of ${thingInGroup}?`];

    case "independent":
      return [
        context.contextual && items
          ? `Try finding the total ${items} for ${groups} ${gNoun} of ${size} on your own.`
          : `Try ${groups} times ${size} on your own.`,
        totalAsk,
      ];

    case "worked_example": {
      if (!facts.example) return null;
      const sum = repeatedSum(groups, size);
      return [
        ...(show ? [`Use a separate example: ${groups} groups of ${size}. Start with 1 row of ${size}.`] : []),
        `Build ${groups} equal rows of ${size}: ${sum} = ${facts.product}, so ${groups} times ${size} is ${facts.product}.`,
        "Now look at your question: how many equal groups are there, and how many are in each group?",
      ];
    }

    case "additive_error":
      return [
        `Adding puts ${groups} and ${size} together once, not in equal ${gNoun}. Multiplication counts ${groups} ${gNoun} of ${thingInGroup}.`,
        ...nextActionLines,
      ];

    case "swapped_factors":
      return [
        `Careful: that swaps the number of ${gNoun} and the size of each ${gSing}. There are ${groups} ${gNoun} with ${thingInGroup} in each ${gSing}, not ${size} ${gNoun} of ${groups}.`,
        ...nextActionLines,
      ];

    case "off_by_one":
      return [
        `Check how many equal ${gNoun} of ${size} you counted. We need ${groups} ${gNoun} of ${size}.`,
        ...nextActionLines,
      ];

    case "guide_groups":
      return [
        canAddGroup
          ? `Let's build ${groups} equal ${gNoun} of ${thingInGroup} on the board.`
          : `We already have ${groups} equal ${gNoun} of ${thingInGroup} on the board.`,
        ...nextActionLines,
      ];

    case "group_added": {
      if (builtGroups <= 0 || builtGroups >= groups) return null;
      const countLine = builtGroups === 1
        ? `Now we have 1 ${gSing} of ${size}.`
        : `Now we have ${builtGroups} ${gNoun} of ${size}: ${repeatedSum(builtGroups, size)} = ${builtGroups * size}.`;
      return [countLine, `Add 1 more group of ${size} to reach ${groups} ${gNoun}.`];
    }

    case "connect_notation": {
      const sum = repeatedSum(groups, size);
      return [
        `Now we have ${groups} ${gNoun} of ${thingInGroup}, shown as ${groups} rows of ${size}.`,
        `That matches ${sum} and ${groups} times ${size}.`,
        totalAsk,
      ];
    }

    case "skip_count": {
      const prev = groups - 1;
      return [
        `${prev} ${gWord(prev)} of ${size} makes ${prev * size}.`,
        `Add 1 more ${gSing} of ${size}.`,
        totalAsk,
      ];
    }

    case "wrong_unit": {
      const want = unitName ?? items ?? "the items the question asks for";
      return [`Check the unit. The question asks for ${want}. What is your answer with the right unit?`];
    }

    case "correct":
      return ["You found the product."];

    case "offer":
      return ["You found the product.", TRANSFER_OFFER];

    case "decline":
      return [`Okay. ${TRANSFER_GOODBYE}`];

    case "transfer":
      return related ? [`Here is one more: ${related[0]} times ${related[1]}.`, "Try it on your own. What is the product?"] : null;

    case "transfer_retry":
      return related ? [`Try ${related[0]} times ${related[1]} again. What is the product?`] : null;

    case "transfer_hint":
      return related ? [`Think of ${related[0]} equal groups of ${related[1]}. Add ${related[1]} ${related[0]} times. What is the product?`] : null;

    case "transfer_show": {
      if (!related) return null;
      const prev = related[0] - 1;
      return [`Picture ${related[0]} rows of ${related[1]}: ${prev} rows make ${prev * related[1]}. Add 1 more row of ${related[1]}. What is the product?`];
    }

    case "transfer_correct":
      return related ? [`You found the product. ${TRANSFER_GOODBYE}`] : null;

    default:
      return null;
  }
}

export type MultiplyRelatedStep = "transfer_retry" | "transfer_hint" | "transfer_show" | "transfer_correct";

export interface MultiplyRelatedReads {
  previous: string;
  repeat: boolean;
  asksShow: boolean;
  stuck: boolean;
  rightProduct: boolean;
  wrongProduct: boolean;
  additive: boolean;
  offByOne: boolean;
}

export function multiplyRelatedChoice(
  r: MultiplyRelatedReads,
): { step: MultiplyRelatedStep; observation?: [MultiplySkill, "correct" | "incorrect"] } {
  const again: MultiplyRelatedStep =
    r.previous === "transfer" || r.previous === "transfer_retry" ? "transfer_retry" : (r.previous as MultiplyRelatedStep);
  if (r.repeat) return { step: again };
  if (r.asksShow) return { step: "transfer_show" };
  if (r.rightProduct) return { step: "transfer_correct", observation: ["product", "correct"] };
  if (r.additive) return { step: "transfer_hint", observation: ["additive_error", "incorrect"] };
  if (r.offByOne) return { step: "transfer_hint", observation: ["off_by_one_group", "incorrect"] };
  if (r.wrongProduct) {
    return {
      step: r.previous === "transfer_hint" || r.previous === "transfer_show" ? "transfer_show" : "transfer_hint",
      observation: ["product", "incorrect"],
    };
  }
  if (r.stuck) return { step: r.previous === "transfer_hint" || r.previous === "transfer_show" ? "transfer_show" : "transfer_hint" };
  return { step: again };
}

/** Keeps checked action shape compatible with ExchangeAction for shared transport helpers. */
export const asBoardActions = (actions: readonly MultiplyAction[]): readonly ExchangeAction[] =>
  actions as unknown as readonly ExchangeAction[];
