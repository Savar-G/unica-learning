import {
  NOT_STATED,
  type ArithOp,
  type Expr,
  type ItemForm,
  type ReaderValue,
  type ResponsePosition,
  type ScoreBand,
  type ScoreBands,
  type SimpleExpr,
} from "./types";

export interface AnswerBoxesConfig {
  appliesTo: number[];
  boxCount: number;
  places: string[];
}

export interface LayoutInfo {
  defaultForm: ReaderValue<ItemForm>;
  defaultPosition: ReaderValue<ResponsePosition>;
  itemForms: Map<number, ItemForm>;
  itemPositions: Map<number, ResponsePosition>;
  answerBoxes?: AnswerBoxesConfig;
  hasWordWorkArea: boolean;
  isReadAloudSection: boolean;
  hasPairedBlocks: boolean;
}

export function normalizeOperators(raw: string): string {
  return raw
    .replace(/×/g, "x")
    .replace(/÷/g, "/")
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/□/g, "[ ]");
}

function opFromSymbol(sym: string): ArithOp | null {
  switch (sym) {
    case "+":
      return "add";
    case "-":
      return "sub";
    case "x":
    case "*":
      return "mul";
    case "/":
      return "div";
    default:
      return null;
  }
}

export function parseScoreBands(raw: string | undefined): ScoreBands | typeof NOT_STATED {
  if (!raw || !raw.trim()) return NOT_STATED;
  const parts = raw.split("|").map((s) => s.trim());
  if (parts.length !== 5) return NOT_STATED;

  const bands: ScoreBand[] = [];
  for (const part of parts) {
    // Strip leading percentage token like "100%", "~90%", "69%~"
    let cleaned = part.replace(/^~?\d+%~?\s*/, "").trim();
    // Strip optional "(mistakes)" or "mistakes" prefix inside or outside parens
    cleaned = cleaned.replace(/^\(\s*mistakes\s*\)\s*/i, "").trim();
    if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    cleaned = cleaned.replace(/^mistakes\s*/i, "").trim();

    if (!cleaned || /^[\u2014\u2013-]$/.test(cleaned) || /^none$/i.test(cleaned)) {
      bands.push(null);
      continue;
    }
    const openMatch = /^(\d+)\s*[~+]$/.exec(cleaned);
    if (openMatch) {
      bands.push([Number(openMatch[1]), "open"]);
      continue;
    }
    const rangeMatch = /^(\d+)\s*[~–-]\s*(\d+)$/.exec(cleaned);
    if (rangeMatch) {
      bands.push([Number(rangeMatch[1]), Number(rangeMatch[2])]);
      continue;
    }
    const singleMatch = /^(\d+)$/.exec(cleaned);
    if (singleMatch) {
      const n = Number(singleMatch[1]);
      bands.push([n, n]);
      continue;
    }
    return NOT_STATED;
  }

  return bands as ScoreBands;
}

export function parseNumberListSpec(spec: string): number[] {
  const nums: number[] = [];
  for (const token of spec.split(/\s*(?:,|and)\s*/i)) {
    const t = token.replace(/[()]/g, "").trim();
    if (!t) continue;
    const range = /^(\d+)\s*[-–~]\s*(\d+)$/.exec(t);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      for (let i = a; i <= b; i += 1) nums.push(i);
    } else if (/^\d+$/.test(t)) {
      nums.push(Number(t));
    }
  }
  return nums;
}

export function splitSectionLayouts(layoutLine: string | undefined, sectionCount: number): string[] {
  if (!layoutLine) return Array.from({ length: sectionCount }, () => "");
  if (sectionCount <= 1) return [layoutLine];

  const out = Array.from({ length: sectionCount }, () => "");
  const secMatches = [...layoutLine.matchAll(/Section\s+(\d+)\s*:?\s*/gi)];
  if (secMatches.length === 0) {
    return Array.from({ length: sectionCount }, () => layoutLine);
  }
  for (let i = 0; i < secMatches.length; i += 1) {
    const m = secMatches[i];
    const secIdx = Number(m[1]) - 1;
    const start = (m.index ?? 0) + m[0].length;
    const end =
      i + 1 < secMatches.length ? (secMatches[i + 1].index ?? layoutLine.length) : layoutLine.length;
    if (secIdx >= 0 && secIdx < sectionCount) {
      out[secIdx] = layoutLine.slice(start, end).replace(/[.;]\s*$/, "").trim();
    }
  }
  return out;
}

const ITEM_REF_STRICT =
  "(?:\\b(?:questions?|items?|rows?)\\s+(?:\\(?\\d+\\)?(?:\\s*[-–~]\\s*\\(?\\d+\\)?)?(?:\\s*(?:,\\s*(?:and\\s+)?|\\band\\s+)\\(?\\d+\\)?(?:\\s*[-–~]\\s*\\(?\\d+\\)?)?)*)|\\(\\d+\\)(?:\\s*[-–~]\\s*\\(\\d+\\))?(?:\\s*(?:,\\s*(?:and\\s+)?|\\band\\s+)\\(\\d+\\)(?:\\s*[-–~]\\s*\\(\\d+\\))?)*|\\b\\d+\\s*[-–~]\\s*\\d+(?:\\s*(?:,\\s*(?:and\\s+)?|\\band\\s+)\\d+(?:\\s*[-–~]\\s*\\d+)?)*)";

const POS_TAIL_SRC =
  "(?:written\\s+)?above\\s+(?:and\\s+(?:to\\s+the\\s+)?right\\s+of\\s+)?(?:the\\s+)?bracket|(?:written\\s+)?(?:under|below)\\s+(?:the\\s+)?line|(?:written\\s+)?in\\s+(?:a|the)\\s+box(?:\\s+after\\s*=)?|(?:written\\s+)?after\\s*=|on\\s+(?:an?\\s+)?answer\\s+line\\s+with\\s+(?:the|a)\\s+unit";

const POS_FULL_SRC =
  "\\banswers?\\s*(?:\\([^)]*\\))?\\s*(?:written\\s+)?above\\s+(?:and\\s+(?:to\\s+the\\s+)?right\\s+of\\s+)?(?:the\\s+)?bracket|\\banswers?\\s+(?:written\\s+)?(?:under|below)\\s+(?:the\\s+)?line|\\banswer\\s+line\\s+below\\b|\\banswers?\\s+(?:written\\s+)?in\\s+(?:a|the)\\s+box(?:\\s+after\\s*=)?|\\bboxed\\s+blanks?\\b|\\blinked\\s+boxes\\b|\\banswers?\\s+(?:written\\s+)?after\\s*=|\\banswer\\s+line\\s+with\\s+(?:the|a)\\s+unit\\b";

const PROBLEM_NOUN_LOOKAHEAD =
  "(?!\\s+(?:sums?|additions?|subtractions?|multiplications?|divisions?|problems?|questions?|items?|rows?|equations?|facts?|exercises?|prompts?)\\b)";

function extractNumbersFromItemRef(ref: string): number[] {
  const cleaned = ref.replace(/^\s*(?:questions?|items?|rows?)\s+/i, "");
  return parseNumberListSpec(cleaned);
}

function parsePositionFragment(fragment: string): {
  position: ResponsePosition | null;
  impliesHorizontal: boolean;
} {
  const lower = fragment.toLowerCase();
  const impliesHorizontal = /\bafter\s*=/.test(lower);
  if (
    /\b(?:written\s+)?above\s+(?:and\s+(?:to\s+the\s+)?right\s+of\s+)?(?:the\s+)?bracket\b/.test(
      lower,
    )
  ) {
    return { position: "above_bracket", impliesHorizontal };
  }
  if (/\b(?:written\s+)?(?:under|below)\s+(?:the\s+)?line\b|\banswer\s+line\s+below\b/.test(lower)) {
    return { position: "under_line", impliesHorizontal };
  }
  if (/\b(?:written\s+)?in\s+(?:a|the)\s+box\b|\bboxed\s+blanks?\b|\blinked\s+boxes\b/.test(lower)) {
    return { position: "box", impliesHorizontal };
  }
  if (/\bafter\s*=/.test(lower)) {
    return { position: "after_equals", impliesHorizontal: true };
  }
  if (/\banswer\s+line\s+with\s+(?:the|a)\s+unit\b/.test(lower)) {
    return { position: "line_with_unit", impliesHorizontal };
  }
  return { position: null, impliesHorizontal };
}

function parseFormKeyword(fragment: string): ItemForm | null {
  const lower = fragment.toLowerCase();
  if (/\blong[- ]division\b|\bdivision\s+brackets?\b|\bbracket(?:\s+form)?\b/.test(lower)) {
    return "bracket";
  }
  if (/\bvertical\b/.test(lower)) return "vertical";
  if (/\bhorizontal\b/.test(lower)) return "horizontal";
  return null;
}

export function parseLayoutInfo(clause: string): LayoutInfo {
  const lower = clause.toLowerCase();
  const itemForms = new Map<number, ItemForm>();
  const itemPositions = new Map<number, ResponsePosition>();
  const itemsWithAfterEquals = new Set<number>();

  const isWord = /\bword\s+problems?\b/.test(lower);
  const isReadAloudSection =
    /(?:multiplication|times)\s+table/.test(lower) && /\b(?:tick|check|boxed|framed)\b/.test(lower);

  let answerBoxes: AnswerBoxesConfig | undefined;
  const boxRe =
    /answers?\s+(?:in|for)\s+((?:\(?\d+\)?(?:\s*[-–~]\s*\(?\d+\)?)?(?:\s*(?:,|and)\s*)?)+)\s+(?:go\s+in|use)\s+(?:two|(\d+))\s+boxes\s*(?:\(([^)]+)\))?/i;
  const boxMatch = boxRe.exec(clause);
  if (boxMatch) {
    const appliesTo = parseNumberListSpec(boxMatch[1]);
    const places = boxMatch[3]
      ? boxMatch[3]
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : [];
    const boxCount = boxMatch[2] ? Number(boxMatch[2]) : places.length || 2;
    answerBoxes = { appliesTo, boxCount, places };
  }

  const withoutBoxes = boxMatch ? clause.replace(boxRe, " ") : clause;

  const colonScopedRe = new RegExp(
    `^\\s*(?:(?:only\\s+)?(?:for|in|on)\\s+)?(${ITEM_REF_STRICT})\\s*:\\s*(.+)$`,
    "i",
  );
  const embeddedPosRe = new RegExp(
    `\\banswers?\\s+(?:in|for|on|of)\\s+(${ITEM_REF_STRICT})\\s+(?:(?:go|are|written)\\s+)?(${POS_TAIL_SRC})`,
    "gi",
  );
  const trailingPosRe = new RegExp(
    `(${POS_FULL_SRC})\\s+(?:only\\s+)?(?:for|in|on)\\s+(${ITEM_REF_STRICT})`,
    "gi",
  );
  const leadingPosRe = new RegExp(
    `(?:(?:only\\s+)?(?:for|in|on)\\s+)?(${ITEM_REF_STRICT})(?:\\s*,|\\s+(?:have|has|use|uses|put|puts|write|writes))\\s+(${POS_FULL_SRC})`,
    "gi",
  );
  const strictFormRe = new RegExp(
    `(${ITEM_REF_STRICT})(?:\\s+(?:are|is|use|uses))?\\s+(vertical|horizontal|bracket)\\b`,
    "gi",
  );
  const listFormRe = new RegExp(
    `\\b(\\d+(?:\\s*(?:,\\s*(?:and\\s+)?|\\band\\s+)\\d+)+)\\s+(vertical|horizontal|bracket)\\b${PROBLEM_NOUN_LOOKAHEAD}`,
    "gi",
  );
  const trailingFormRe = new RegExp(
    `\\b(vertical|horizontal|bracket)\\s+(?:only\\s+)?(?:for|in|on)\\s+(${ITEM_REF_STRICT})`,
    "gi",
  );

  const applyPosToItems = (refText: string, posFragment: string): void => {
    const { position, impliesHorizontal } = parsePositionFragment(posFragment);
    for (const n of extractNumbersFromItemRef(refText)) {
      if (position) itemPositions.set(n, position);
      if (impliesHorizontal) itemsWithAfterEquals.add(n);
    }
  };

  const sectionRemainders: string[] = [];
  for (const subclause of withoutBoxes.split(";")) {
    const colonMatch = colonScopedRe.exec(subclause);
    if (colonMatch) {
      const nums = extractNumbersFromItemRef(colonMatch[1]);
      const rhs = colonMatch[2];
      const form = parseFormKeyword(rhs);
      const { position, impliesHorizontal } = parsePositionFragment(rhs);
      for (const n of nums) {
        if (form) itemForms.set(n, form);
        if (position) itemPositions.set(n, position);
        if (impliesHorizontal) itemsWithAfterEquals.add(n);
      }
      continue;
    }

    let remaining = subclause;

    remaining = remaining.replace(embeddedPosRe, (_full, refText: string, posText: string) => {
      applyPosToItems(refText, posText);
      return " ";
    });
    remaining = remaining.replace(trailingPosRe, (_full, posText: string, refText: string) => {
      applyPosToItems(refText, posText);
      return " ";
    });
    remaining = remaining.replace(leadingPosRe, (_full, refText: string, posText: string) => {
      applyPosToItems(refText, posText);
      return " ";
    });

    remaining = remaining.replace(strictFormRe, (_full, refText: string, formText: string) => {
      const form = formText.toLowerCase() as ItemForm;
      for (const n of extractNumbersFromItemRef(refText)) itemForms.set(n, form);
      return " ";
    });
    remaining = remaining.replace(listFormRe, (_full, refText: string, formText: string) => {
      const form = formText.toLowerCase() as ItemForm;
      for (const n of parseNumberListSpec(refText)) itemForms.set(n, form);
      return " ";
    });
    remaining = remaining.replace(trailingFormRe, (_full, formText: string, refText: string) => {
      const form = formText.toLowerCase() as ItemForm;
      for (const n of extractNumbersFromItemRef(refText)) itemForms.set(n, form);
      return " ";
    });

    sectionRemainders.push(remaining);
  }

  for (const n of itemsWithAfterEquals) {
    if (!itemForms.has(n)) {
      itemForms.set(n, "horizontal");
    }
  }

  const sectionClause = sectionRemainders.join("; ").toLowerCase();

  let defaultForm: ReaderValue<ItemForm> = NOT_STATED;
  if (/\blong[- ]division\b|\bdivision\s+brackets?\b|\bbracket\s+form\b/.test(sectionClause)) {
    defaultForm = "bracket";
  } else if (/\bvertical\b/.test(sectionClause)) {
    defaultForm = "vertical";
  } else if (/\bhorizontal\b/.test(sectionClause)) {
    defaultForm = "horizontal";
  }

  // An answer written after an equals sign is a layout statement of a horizontal equation.
  if (defaultForm === NOT_STATED && /\banswers?\b[^;.]*\bafter\s*=/.test(sectionClause)) {
    defaultForm = "horizontal";
  }

  // Response position comes ONLY from explicit section-wide position statements
  let defaultPosition: ReaderValue<ResponsePosition> = NOT_STATED;
  if (
    /\banswers?\s*(?:\([^)]*\))?\s*(?:written\s+)?above\s+(?:and\s+(?:to\s+the\s+)?right\s+of\s+)?(?:the\s+)?bracket/.test(
      sectionClause,
    )
  ) {
    defaultPosition = "above_bracket";
  } else if (
    /\banswers?\s+(?:written\s+)?(?:under|below)\s+(?:the\s+)?line|\banswer\s+line\s+below\b/.test(
      sectionClause,
    )
  ) {
    defaultPosition = "under_line";
  } else if (
    /\banswers?\s+(?:written\s+)?in\s+(?:a|the)\s+box|\bboxed\s+blanks?\b|\blinked\s+boxes\b/.test(
      sectionClause,
    )
  ) {
    defaultPosition = "box";
  } else if (/\banswers?\s+(?:written\s+)?after\s*=/.test(sectionClause)) {
    defaultPosition = "after_equals";
  } else if (/\banswer\s+line\s+with\s+(?:the|a)\s+unit/.test(sectionClause)) {
    defaultPosition = "line_with_unit";
  }

  // Block-level evidence that consecutive rows are printed as pairs inside blocks
  const hasPairedBlocks =
    /\b(?:each|per)\s+block\b[^.;]*\b(?:two|2)\s+(?:[a-z-]+\s+)?(?:questions?|items?|prompts?|problems?|equations?)\b|\bpairs?\s+of\s+(?:two\s+)?(?:questions?|items?|prompts?|equations?)\b/.test(
      lower,
    );

  return {
    defaultForm,
    defaultPosition,
    itemForms,
    itemPositions,
    answerBoxes,
    hasWordWorkArea: isWord && /\bwork\s+area\b/.test(lower),
    isReadAloudSection,
    hasPairedBlocks,
  };
}

export interface ParsedQuestion {
  expr: Expr | null;
  printed: string;
  hasBoxBlank: boolean;
  linkedPartsPrinted?: [string, string];
  wordEquationFrame?: string;
  wordUnit?: string;
  wordShowWorkCue?: string;
  wordHasAnsLine?: boolean;
}

export function parseSimpleExpressionText(
  raw: string,
): { expr: SimpleExpr; hasBoxBlank: boolean } | null {
  const norm = normalizeOperators(raw).replace(/\s*\(vertical\)\s*$/i, "").trim();

  // Long division bracket syntax: "<divisor>) <dividend>"
  const bracketMatch = /^(\d+)\)\s*(\d+)$/.exec(norm);
  if (bracketMatch) {
    return {
      expr: {
        kind: "arith",
        op: "div",
        operands: [Number(bracketMatch[2]), Number(bracketMatch[1])],
      },
      hasBoxBlank: false,
    };
  }

  // Chain syntax: hyphen-separated sequence of numbers and blanks
  if (norm.includes("[ ]") && !norm.includes("=") && norm.includes(" - ")) {
    const tokens = norm.split(/\s+-\s+/).map((t) => t.trim());
    if (tokens.length >= 3 && tokens.every((t) => t === "[ ]" || /^\d+$/.test(t))) {
      const terms = tokens.map((t) => (t === "[ ]" ? null : Number(t)));
      if (terms.some((t) => t === null) && terms.some((t) => t !== null)) {
        return { expr: { kind: "chain", terms }, hasBoxBlank: true };
      }
    }
  }

  // Equation with "=" (either arithmetic expression or missing-operand equation)
  const eqMatch = /^(.+?)\s*=\s*(.*)$/.exec(norm);
  if (eqMatch) {
    const lhs = eqMatch[1].trim();
    const rhs = eqMatch[2].trim();

    const parts = lhs.split(/\s+([+\-x/])\s+/);
    if (parts.length >= 3 && parts.length % 2 === 1) {
      const ops: string[] = [];
      const vals: Array<number | null> = [];
      let ok = true;
      for (let i = 0; i < parts.length; i += 1) {
        if (i % 2 === 0) {
          const tok = parts[i].trim();
          if (tok === "[ ]") vals.push(null);
          else if (/^\d+$/.test(tok)) vals.push(Number(tok));
          else ok = false;
        } else {
          ops.push(parts[i]);
        }
      }
      const op = ops.length > 0 && ops.every((o) => o === ops[0]) ? opFromSymbol(ops[0]) : null;
      if (ok && op) {
        const lhsHasBlank = vals.some((v) => v === null);
        if (lhsHasBlank && /^\d+$/.test(rhs)) {
          return {
            expr: { kind: "missing", op, operands: vals, result: Number(rhs) },
            hasBoxBlank: true,
          };
        }
        if (!lhsHasBlank && (rhs === "" || rhs === "[ ]")) {
          return {
            expr: { kind: "arith", op, operands: vals as number[] },
            hasBoxBlank: rhs === "[ ]",
          };
        }
      }
    }
  }

  // Bare arithmetic expression without '='
  const bareParts = norm.split(/\s+([+\-x/])\s+/);
  if (bareParts.length >= 3 && bareParts.length % 2 === 1) {
    const ops: string[] = [];
    const nums: number[] = [];
    let ok = true;
    for (let i = 0; i < bareParts.length; i += 1) {
      if (i % 2 === 0) {
        const tok = bareParts[i].trim();
        if (/^\d+$/.test(tok)) nums.push(Number(tok));
        else ok = false;
      } else {
        ops.push(bareParts[i]);
      }
    }
    const op = ops.length > 0 && ops.every((o) => o === ops[0]) ? opFromSymbol(ops[0]) : null;
    if (ok && op) {
      return { expr: { kind: "arith", op, operands: nums }, hasBoxBlank: false };
    }
  }

  return null;
}

export function parseQuestionCell(rawQuestion: string): ParsedQuestion {
  const trimmed = rawQuestion.trim();
  const cleanedPrinted = trimmed.replace(/\s*\(vertical\)\s*$/i, "").trim();

  // Linked pair separated by "→" or "->" in transcription; connector stays not_stated unless confirmed
  const arrowSplit = cleanedPrinted.split(/\s*(?:→|->)\s*/);
  if (arrowSplit.length === 2) {
    const leftRaw = arrowSplit[0].trim();
    const rightRaw = arrowSplit[1].trim();
    const left = parseSimpleExpressionText(leftRaw);
    const right = parseSimpleExpressionText(rightRaw);
    if (left && right) {
      return {
        expr: { kind: "linked", pair: [left.expr, right.expr], connector: NOT_STATED },
        printed: cleanedPrinted,
        hasBoxBlank: left.hasBoxBlank || right.hasBoxBlank,
        linkedPartsPrinted: [leftRaw, rightRaw],
      };
    }
  }

  // Word problem detection: prose with show-work or answer-line markers
  const showWorkMatch = /\(Show your work\.?\)/i.exec(cleanedPrinted);
  const ansMarkerMatch = /\(Ans\.?\)/i.exec(cleanedPrinted);
  if (showWorkMatch || ansMarkerMatch) {
    const ansMatch = /\(Ans\.?\)\s*_+\s*([A-Za-z][A-Za-z\s-]*)$/i.exec(cleanedPrinted);
    const unit = ansMatch ? ansMatch[1].trim() : undefined;
    const textOnly = cleanedPrinted
      .replace(/\s*\(Show your work\.?\).*$/i, "")
      .replace(/\s*\(Ans\.?\).*$/i, "")
      .trim();

    const betweenMatch = /\(Show your work\.?\)\s*(.*?)\s*\(Ans\.?\)/i.exec(cleanedPrinted);
    const frameRaw = betweenMatch ? betweenMatch[1].trim() : "";
    let embeddedExpr: SimpleExpr | typeof NOT_STATED = NOT_STATED;
    let wordEquationFrame: string | undefined;
    let frameHasBox = false;
    if (frameRaw) {
      const parsedFrame = parseSimpleExpressionText(frameRaw);
      if (parsedFrame) {
        embeddedExpr = parsedFrame.expr;
        wordEquationFrame = frameRaw;
        frameHasBox = parsedFrame.hasBoxBlank;
      }
    }

    return {
      expr: {
        kind: "word",
        text: textOnly || cleanedPrinted,
        expr: embeddedExpr,
        ...(unit ? { unit } : {}),
      },
      printed: cleanedPrinted,
      hasBoxBlank: frameHasBox,
      wordEquationFrame,
      wordUnit: unit,
      wordShowWorkCue: showWorkMatch ? showWorkMatch[0] : undefined,
      wordHasAnsLine: Boolean(ansMatch),
    };
  }

  const simple = parseSimpleExpressionText(trimmed);
  if (simple) {
    return {
      expr: simple.expr,
      printed: cleanedPrinted,
      hasBoxBlank: simple.hasBoxBlank,
    };
  }

  return {
    expr: null,
    printed: cleanedPrinted,
    hasBoxBlank: false,
  };
}

export function normalizeAnswerForCompare(raw: string, unit?: string): string {
  let s = raw.trim();
  if (unit) {
    const unitRe = new RegExp(`\\s+${unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    s = s.replace(unitRe, "").trim();
  }
  s = s.replace(/\s*([;,])\s*/g, "$1");
  s = s.replace(/\s*r\s*(\d+)/i, " R$1");
  return s.replace(/\s+/g, " ").trim();
}
