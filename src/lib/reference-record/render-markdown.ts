import {
  computeItemFeatures,
  computePageOrderingPattern,
  type ItemFeatures,
} from "./compute";
import type {
  ContentsRecord,
  Example,
  Expr,
  ItemResponse,
  PageRecord,
  ReferenceRecord,
  Scaffold,
  ScoreBand,
} from "./types";

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function formatScoreBand(band: ScoreBand): string {
  if (band === null) return "-";
  if (typeof band === "string") return band;
  const [low, high] = band;
  if (high === "open") return `${low}~`;
  return low === high && typeof low === "number" ? String(low) : `${low}–${high}`;
}

function formatResponse(r: ItemResponse): string {
  const parts: string[] = [String(r.position)];
  if (r.place) parts.push(`place=${r.place}`);
  if (r.unit) parts.push(`unit=${r.unit}`);
  if (r.cue !== null) parts.push(`cue=${r.cue}`);
  const ans = r.answer === null ? "null" : r.answer;
  return `${parts.join(", ")} → **${ans}** (${r.answer_source})`;
}

function formatNotationDetails(latex: string, figure: string | null | undefined): string {
  const parts: string[] = [`latex: \`${latex}\``];
  if (figure !== undefined && figure !== null) {
    parts.push(`figure: ${figure}`);
  }
  return `notation (${parts.join("; ")})`;
}

function formatFeatures(f: ItemFeatures, expr?: Expr | null): string {
  if (f.expr_kind === null) return "action (no expression)";
  if (expr?.kind === "notation") {
    return formatNotationDetails(expr.latex, expr.figure);
  }
  if (f.arith) {
    const a = f.arith;
    const tags: string[] = [`${a.op}`, `digits=${a.operand_digits.join("×")}`];
    if (a.repeated_operands) tags.push(`repeated(${a.operand_count})`);
    if (a.carries.length > 0) tags.push(`carries=${a.carries.join("+")}`);
    if (a.borrows.length > 0) tags.push(`borrows=${a.borrows.join("+")}`);
    if (a.has_remainder) tags.push("remainder");
    if (a.has_zero_operand) tags.push("zero");
    if (a.has_one_operand) tags.push("one");
    return tags.join(", ");
  }
  if (f.linked_parts) {
    const leftExpr = expr?.kind === "linked" ? expr.pair[0] : undefined;
    const rightExpr = expr?.kind === "linked" ? expr.pair[1] : undefined;
    return `linked(${formatFeatures(f.linked_parts[0], leftExpr)} | ${formatFeatures(f.linked_parts[1], rightExpr)})`;
  }
  if (expr?.kind === "word" && expr.expr && typeof expr.expr === "object" && expr.expr.kind === "notation") {
    return `word (${formatNotationDetails(expr.expr.latex, expr.expr.figure)})`;
  }
  if (f.chain) {
    return `chain(len=${f.chain.length}, blanks=${f.chain.blank_count}, step=${f.chain.step ?? "?"})`;
  }
  return f.expr_kind;
}

function formatScaffold(s: Scaffold): string {
  const applies = Array.isArray(s.applies_to) ? `[${s.applies_to.join(", ")}]` : s.applies_to;
  switch (s.kind) {
    case "answer_boxes":
      return `\`answer_boxes\` (items ${applies}): count=${s.box_count ?? "?"}, places=${Array.isArray(s.places) ? s.places.join("/") : (s.places ?? "-")}`;
    case "number_strip":
      return `\`number_strip\` (items ${applies}): values=${Array.isArray(s.values) ? s.values.join(", ") : s.values}, highlighted=${Array.isArray(s.highlighted) ? s.highlighted.join(", ") : String(s.highlighted ?? "none")}`;
    case "table_read_aloud":
      return `\`table_read_aloud\` (items ${applies}): checkbox=${String(s.has_checkbox ?? "-")}, caption_style=${String(s.caption_style ?? "-")}`;
    case "equation_frame":
      return `\`equation_frame\` (items ${applies}): \`${s.template}\``;
    case "arrow":
      return `\`arrow\` (items ${applies}): ${s.from ?? "?"} → ${s.to ?? "?"}${s.label ? ` (${s.label})` : ""}`;
    case "caption":
      return `\`caption\` (items ${applies}): "${s.text}"${s.target ? ` on \`${s.target}\`` : ""}`;
    case "helper_digit":
    case "partial_working":
    case "worked_item":
      return `\`${s.kind}\` (items ${applies})${s.description ? `: ${s.description}` : ""}`;
    case "other":
      return `\`other\` (items ${applies}): ${s.description}`;
  }
}

function formatExample(ex: Example, idx: number): string[] {
  const out: string[] = [];
  const header = `### Example ${idx + 1}${ex.label ? ` - ${ex.label}` : ""} (${ex.position}, ${ex.relation})`;
  out.push(header);
  for (const part of ex.parts) {
    const cap = part.caption ? `${part.caption}: ` : "";
    const exprText = part.expr ? JSON.stringify(part.expr) : "none";
    const shown = part.shown_answer ? ` = ${part.shown_answer}` : "";
    out.push(`- ${cap}[${part.form}] \`${exprText}\`${shown}`);
  }
  if (ex.steps !== undefined) {
    if (Array.isArray(ex.steps)) {
      if (ex.steps.length > 0) {
        out.push("- Steps:");
        for (const step of ex.steps) {
          const showsLabel =
            step.shows === "other" && step.shows_other
              ? `other (${step.shows_other})`
              : String(step.shows);
          const printedText = step.printed === null ? "-" : `\`${step.printed}\``;
          const noteSuffix =
            step.note !== undefined && step.note !== null ? ` (note: ${step.note})` : "";
          out.push(`  ${step.n}. [${showsLabel}] ${printedText}${noteSuffix}`);
        }
      }
    } else {
      out.push(`- Steps: ${ex.steps}`);
    }
  }
  if (ex.marks !== undefined) {
    if (Array.isArray(ex.marks)) {
      if (ex.marks.length > 0) {
        out.push("- Marks:");
        for (const mark of ex.marks) {
          const stepSuffix = mark.step !== undefined ? ` (step ${mark.step})` : "";
          const descSuffix =
            mark.description !== undefined && mark.description !== null
              ? `: ${mark.description}`
              : "";
          out.push(`  - \`${mark.kind}\`${stepSuffix}${descSuffix}`);
        }
      }
    } else {
      out.push(`- Marks: ${ex.marks}`);
    }
  }
  if (ex.text) out.push(`- Text: ${ex.text}`);
  if (ex.cross_ref) out.push(`- Cross-ref: ${ex.cross_ref}`);
  return out;
}

function renderPageMarkdown(page: PageRecord): string {
  const lines: string[] = [];
  const ordering = computePageOrderingPattern(page);

  lines.push(`# ${page.source_ref}`);
  lines.push("");
  lines.push(
    `- **Topic:** ${page.topic.title ?? "-"}${page.topic.number !== undefined ? ` (number: ${page.topic.number})` : ""}`,
  );
  if (Array.isArray(page.score_bands)) {
    const labels = ["100%", "~90%", "~80%", "~70%", "69%~"];
    const formatted = page.score_bands.map((b, i) => `${labels[i]}: ${formatScoreBand(b)}`).join(" | ");
    lines.push(`- **Score bands:** ${formatted}`);
  } else {
    lines.push(`- **Score bands:** ${page.score_bands}`);
  }
  lines.push(`- **Ordering pattern:** ${ordering.summary}`);
  lines.push("");

  if (Array.isArray(page.examples) && page.examples.length > 0) {
    lines.push("## Examples");
    page.examples.forEach((ex, i) => {
      lines.push(...formatExample(ex, i));
      lines.push("");
    });
  } else if (!Array.isArray(page.examples)) {
    lines.push(`## Examples`);
    lines.push(`- ${page.examples}`);
    lines.push("");
  }

  page.sections.forEach((sec, si) => {
    lines.push(`## Section ${si + 1}`);
    lines.push(`- **Instruction:** ${sec.instruction ?? "-"}`);
    lines.push(`- **Section ordering:** ${ordering.sections[si]?.description ?? "-"}`);
    if (Array.isArray(sec.scaffolds)) {
      if (sec.scaffolds.length === 0) {
        lines.push("- **Scaffolds:** none");
      } else {
        lines.push("- **Scaffolds:**");
        for (const sc of sec.scaffolds) {
          lines.push(`  - ${formatScaffold(sc)}`);
        }
      }
    } else {
      lines.push(`- **Scaffolds:** ${sec.scaffolds}`);
    }
    lines.push("");
    lines.push("| # | Printed | Form | Responses | Computed features |");
    lines.push("|---:|---|---|---|---|");
    for (const item of sec.items) {
      const printed = escapeTableCell(String(item.printed));
      const form = escapeTableCell(item.form === null ? "-" : String(item.form));
      const resp =
        item.responses.length === 0
          ? "-"
          : item.responses.map((r) => escapeTableCell(formatResponse(r))).join("<br>");
      const feats = escapeTableCell(formatFeatures(computeItemFeatures(item), item.expr));
      lines.push(`| ${item.n} | ${printed} | ${form} | ${resp} | ${feats} |`);
    }
    lines.push("");
  });

  return lines.join("\n");
}

function renderContentsMarkdown(contents: ContentsRecord): string {
  const lines: string[] = [];
  lines.push(`# ${contents.source_ref}`);
  lines.push("");
  lines.push("| # | Topic | Sheets | Std time |");
  lines.push("|---:|---|---|---|");
  for (const t of contents.topics) {
    const sheets = Array.isArray(t.sheets)
      ? `${t.sheets[0]}–${t.sheets[1]}`
      : t.sheets === null
        ? "not printed"
        : String(t.sheets);
    const time =
      t.std_time_min === null
        ? "-"
        : Array.isArray(t.std_time_min)
          ? `${t.std_time_min[0]}–${t.std_time_min[1]} min`
          : String(t.std_time_min);
    lines.push(
      `| ${t.n} | ${escapeTableCell(String(t.title))} | ${escapeTableCell(sheets)} | ${escapeTableCell(time)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function renderRecordToMarkdown(record: ReferenceRecord): string {
  return record.kind === "page"
    ? renderPageMarkdown(record)
    : renderContentsMarkdown(record);
}
