import {
  ITEM_FORMS,
  NOT_STATED,
  type Example,
  type ExamplePart,
  type ItemForm,
  type ReaderValue,
  type Scaffold,
} from "./types";
import {
  parseNumberListSpec,
  parseSimpleExpressionText,
  type LayoutInfo,
} from "./parse-legacy-helpers";

export function parseWorkedExampleJson(raw: string): Example | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const posStr = typeof parsed.position === "string" ? parsed.position.toLowerCase() : "";
    const position: Example["position"] = posStr.includes("top")
      ? "top"
      : posStr.includes("foot") || posStr.includes("bottom")
        ? "foot"
        : posStr.includes("inline")
          ? "inline"
          : NOT_STATED;

    const explicitForm: ReaderValue<ItemForm> =
      typeof parsed.form === "string" && (ITEM_FORMS as readonly string[]).includes(parsed.form)
        ? (parsed.form as ItemForm)
        : NOT_STATED;

    const steps = Array.isArray(parsed.steps_shown)
      ? parsed.steps_shown.filter((s): s is string => typeof s === "string")
      : [];
    const parts: ExamplePart[] = [];
    for (const step of steps) {
      const colonIdx = step.indexOf(":");
      const caption = colonIdx >= 0 ? step.slice(0, colonIdx).trim() : undefined;
      const eqStr = (colonIdx >= 0 ? step.slice(colonIdx + 1) : step).trim();
      const eqSplit = eqStr.split("=");
      if (eqSplit.length === 2) {
        const lhs = parseSimpleExpressionText(eqSplit[0].trim());
        const shown = eqSplit[1].trim();
        parts.push({
          ...(caption ? { caption } : {}),
          form: explicitForm,
          expr: lhs ? lhs.expr : null,
          shown_answer: shown || null,
        });
      }
    }
    if (parts.length === 0) return null;

    const isTable =
      (typeof parsed.problem === "string" && /table|chart/i.test(parsed.problem)) ||
      posStr.includes("table");

    return {
      position,
      relation: isTable ? "table" : "sequence",
      parts,
      ...(typeof parsed.problem === "string" ? { label: parsed.problem } : {}),
    };
  } catch {
    return null;
  }
}

export function parseHintsAndNoteExamples(
  hintsLine: string | undefined,
  layoutInfo: LayoutInfo,
  hasWorkedTableExample: boolean,
): { scaffolds: Scaffold[] | typeof NOT_STATED; noteExamples: Example[] } {
  const scaffolds: Scaffold[] = [];
  const noteExamples: Example[] = [];

  if (layoutInfo.answerBoxes) {
    scaffolds.push({
      kind: "answer_boxes",
      applies_to: layoutInfo.answerBoxes.appliesTo,
      box_count: layoutInfo.answerBoxes.boxCount,
      ...(layoutInfo.answerBoxes.places.length > 0 ? { places: layoutInfo.answerBoxes.places } : {}),
    });
  }

  if (hasWorkedTableExample) {
    const hasCheckbox =
      Boolean(hintsLine && /check\s*box|tick/i.test(hintsLine)) || layoutInfo.isReadAloudSection;
    scaffolds.push({
      kind: "table_read_aloud",
      applies_to: "all",
      has_checkbox: hasCheckbox,
      caption_style: "spoken_words",
    });
  }

  if (!hintsLine) {
    return {
      scaffolds: scaffolds.length > 0 ? scaffolds : NOT_STATED,
      noteExamples,
    };
  }

  // Number-strip hint rows describing boxed values, item ranges, and highlighted values
  if (/number-strip/i.test(hintsLine)) {
    const numsMatch = /numbers?\s+([\d,\s]+)/i.exec(hintsLine);
    const values = numsMatch
      ? numsMatch[1]
          .split(",")
          .map((s) => s.trim())
          .filter((s) => /^\d+$/.test(s))
          .map(Number)
      : [];
    const rangeMatches = [...hintsLine.matchAll(/above\s+(?:questions?\s+)?(\d+\s*-\s*\d+)/gi)];
    const highlightMatches = [
      ...hintsLine.matchAll(
        /\bbox\s+(\d+)\s+(?:has\s+a\s+bold|is\s+(?:bold|highlighted|outlined))\b/gi,
      ),
    ];

    if (values.length >= 2 && rangeMatches.length > 0) {
      rangeMatches.forEach((rm, idx) => {
        const appliesTo = parseNumberListSpec(rm[1]);
        const hl = highlightMatches[idx] ? [Number(highlightMatches[idx][1])] : null;
        scaffolds.push({
          kind: "number_strip",
          applies_to: appliesTo.length > 0 ? appliesTo : "all",
          values,
          highlighted: hl,
        });
      });
    }
  }

  // Arrow scaffold connecting two parts of a row
  const arrowMatch =
    /Arrow\s+from\s+([^;]+?)\s+to\s+([^;]+?)(?:\s+in\s+rows?\s+((?:\d+(?:\s*[-–~]\s*\d+)?(?:\s*(?:,|and)\s*)?)+))?(?:;|$)/i.exec(
      hintsLine,
    );
  if (arrowMatch) {
    const rowNums = arrowMatch[3] ? parseNumberListSpec(arrowMatch[3]) : [];
    scaffolds.push({
      kind: "arrow",
      applies_to: rowNums.length > 0 ? rowNums : "all",
      from: /left|multiplication/i.test(arrowMatch[1]) ? "left_equation" : arrowMatch[1].trim(),
      to: /right|division/i.test(arrowMatch[2]) ? "right_equation" : arrowMatch[2].trim(),
    });
  }

  // Printed caption scaffold attached to a target expression
  const captionMatch =
    /(?:Printed\s+)?caption\s+(?:under|below|for)\s+([^:]+):\s*['"]([^'"]+)['"]/i.exec(hintsLine);
  if (captionMatch) {
    const arrowApplies = arrowMatch && arrowMatch[3] ? parseNumberListSpec(arrowMatch[3]) : [];
    scaffolds.push({
      kind: "caption",
      applies_to: arrowApplies.length > 0 ? arrowApplies : [1],
      text: captionMatch[2].trim(),
      target: captionMatch[1].trim(),
    });
  }

  // Note box example at bottom or top with labeled comparison parts, text, and optional cross-reference
  const noteMatch = /Note\s+box\s+at\s+(bottom|top):\s*(.+)$/i.exec(hintsLine);
  if (noteMatch) {
    const pos = noteMatch[1].toLowerCase() === "bottom" ? "foot" : "top";
    const body = noteMatch[2];
    const partMatches = [...body.matchAll(/(\([^)]+\))\s*([^,=]+?)\s*=\s*(\d+)/g)];
    const parts: ExamplePart[] = [];
    for (const pm of partMatches) {
      const lhs = parseSimpleExpressionText(pm[2].trim());
      if (lhs) {
        parts.push({
          caption: pm[1].trim(),
          form: NOT_STATED,
          expr: lhs.expr,
          shown_answer: pm[3].trim(),
        });
      }
    }
    const textMatch = /then\s+text:\s*([^.]+(?:\.)?)/i.exec(body);
    const refMatch = /reference:\s*\*?:\s*([^\s;]+)/i.exec(body);
    if (parts.length > 0) {
      noteExamples.push({
        position: pos,
        relation: parts.length >= 2 ? "compare" : "sequence",
        label: "Note",
        parts,
        ...(textMatch ? { text: textMatch[1].trim() } : {}),
        ...(refMatch ? { cross_ref: refMatch[1].trim() } : {}),
      });
    }
  }

  return {
    scaffolds: scaffolds.length > 0 ? scaffolds : NOT_STATED,
    noteExamples,
  };
}
