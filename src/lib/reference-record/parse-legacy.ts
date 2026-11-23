import {
  parseLayoutInfo,
  parseQuestionCell,
  parseScoreBands,
  splitSectionLayouts,
} from "./parse-legacy-helpers";
import { parseHintsAndNoteExamples, parseWorkedExampleJson } from "./parse-legacy-hints";
import {
  buildPairedSectionItems,
  buildSingleSectionItems,
  canPairRowsInSection,
  type RawRow,
} from "./parse-legacy-items";
import {
  NOT_STATED,
  type ContentsRecord,
  type ContentsTopic,
  type Example,
  type PageItem,
  type PageRecord,
  type PageSection,
  type Scaffold,
} from "./types";

export interface ParseLegacyOptions {
  source?: string;
  level?: string;
}

export interface AnswerDiff {
  sourceRef: string;
  itemRef: string;
  printed: string;
  fileAnswer: string;
  computedAnswer: string;
}

export interface PageConversionCounts {
  items: number;
  questionRows: number;
  actionItems: number;
  computedItems: number;
  uncheckedItems: number;
  answerDiffs: number;
}

export interface ConvertedPage {
  record: PageRecord;
  notStatedFields: string[];
  answerDiffs: AnswerDiff[];
  counts: PageConversionCounts;
}

export interface LegacyConversionResult {
  source: string;
  level: string;
  contents: ContentsRecord | null;
  pages: ConvertedPage[];
}

function inferSourceAndLevel(
  markdown: string,
  opts: ParseLegacyOptions,
): { source: string; level: string } {
  let source = opts.source;
  let level = opts.level;

  const h1 = /^#\s+([A-Za-z][A-Za-z0-9_-]*)\s+Level\s+([A-Za-z0-9_-]+)/im.exec(markdown);
  if (h1) {
    if (!source) source = h1[1].toLowerCase();
    if (!level) level = h1[2].toUpperCase();
  }
  if (!level) {
    const firstPage = /^####\s+([A-Za-z]+)\d+[a-z]\b/m.exec(markdown);
    if (firstPage) level = firstPage[1].toUpperCase();
  }
  return { source: source || "ref", level: level || "UNKNOWN" };
}

function parseContentsTable(markdown: string, source: string, level: string): ContentsRecord | null {
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length - 2; i += 1) {
    const header = lines[i].trim();
    if (!header.startsWith("|")) continue;
    const cols = header
      .slice(1, header.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((c) => c.trim().toLowerCase());
    const topicIdx = cols.findIndex((c) => c.includes("topic"));
    const sheetsIdx = cols.findIndex((c) => c === "sheets");
    const timeIdx = cols.findIndex((c) => c.includes("std time"));
    if (topicIdx === -1 || sheetsIdx === -1 || timeIdx === -1) continue;
    if (!lines[i + 1].trim().startsWith("|---")) continue;

    const topics: ContentsTopic[] = [];
    for (let j = i + 2; j < lines.length; j += 1) {
      const row = lines[j].trim();
      if (!row.startsWith("|")) break;
      const cells = row
        .slice(1, row.endsWith("|") ? -1 : undefined)
        .split("|")
        .map((c) => c.trim());
      const topicCell = cells[topicIdx] ?? "";
      const sheetCell = cells[sheetsIdx] ?? "";
      const timeCell = cells[timeIdx] ?? "";

      const tMatch = /^(\d+)\.\s*(.+)$/.exec(topicCell);
      const sMatch = /[A-Za-z]*(\d+)\s*[–-]\s*[A-Za-z]*(\d+)/.exec(sheetCell);
      const tmMatch = /(\d+)\s*[–-]\s*(\d+)/.exec(timeCell);
      if (!tMatch || !sMatch) continue;

      const stdTime: [number, number] | null = tmMatch
        ? [Number(tmMatch[1]), Number(tmMatch[2])]
        : /^\d+$/.test(timeCell)
          ? [Number(timeCell), Number(timeCell)]
          : null;

      topics.push({
        n: Number(tMatch[1]),
        title: tMatch[2].trim(),
        sheets: [Number(sMatch[1]), Number(sMatch[2])],
        std_time_min: stdTime,
      });
    }

    if (topics.length > 0) {
      return {
        kind: "contents",
        source_ref: `${source}:${level}:contents`,
        topics,
      };
    }
  }
  return null;
}

function parseSectionInstructions(instructionLine: string | undefined): string[] {
  if (!instructionLine || !instructionLine.trim()) return [];
  const numbered = instructionLine.split(/\s*\/\s*(?=\d+\.\s)/);
  if (numbered.length > 1 && /^\d+\.\s/.test(numbered[0].trim())) {
    return numbered.map((part) => part.replace(/^\d+\.\s*/, "").trim());
  }
  return [instructionLine.trim()];
}

export function collectNotStatedFields(value: unknown, path = "", out: string[] = []): string[] {
  if (value === NOT_STATED) {
    out.push(path || "$");
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectNotStatedFields(v, `${path}[${i}]`, out));
    return out;
  }
  if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      collectNotStatedFields(v, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

function remapScaffolds(
  scaffolds: PageSection["scaffolds"],
  rawToFinalN: Map<number, number>,
): PageSection["scaffolds"] {
  if (!Array.isArray(scaffolds) || rawToFinalN.size === 0) return scaffolds;
  return scaffolds.map((sc) => {
    if (!Array.isArray(sc.applies_to)) return sc;
    const mapped: number[] = [];
    for (const rawN of sc.applies_to) {
      const targetN = rawToFinalN.get(rawN) ?? rawN;
      if (!mapped.includes(targetN)) mapped.push(targetN);
    }
    return { ...sc, applies_to: mapped };
  });
}

function parsePageBlock(block: string, source: string): ConvertedPage {
  const lines = block.split(/\r?\n/);
  const headerLine = lines[0].trim();

  // Header format: "<Level><Sheet><side> <dash> <Topic Title> (<optional image id>)"
  const hMatch = /^([A-Za-z]+)(\d+)([a-z])\s*[\u2014\u2013-]\s*(.+?)(?:\s*\([^)]+\))?\s*$/.exec(headerLine);
  // A title that is only a parenthesised image id means the title is missing.
  if (!hMatch || !hMatch[4].trim() || /^\(.*\)$/.test(hMatch[4].trim())) {
    throw new Error(
      `Invalid page header "#### ${headerLine}": expected "<Level><Sheet><side> - <Title>".`,
    );
  }
  const pageLevel = hMatch[1].toUpperCase();
  const sheetNum = hMatch[2];
  const side = hMatch[3].toLowerCase();
  const topicTitle = hMatch[4].trim();
  const sourceRef = `${source}:${pageLevel}:${sheetNum}${side}`;

  let instructionLine: string | undefined;
  let layoutLine: string | undefined;
  let bandsLine: string | undefined;
  let hintsLine: string | undefined;
  let workedExampleLine: string | undefined;

  const tableLines: string[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith("- Instruction:")) {
      instructionLine = line.slice("- Instruction:".length).trim();
    } else if (line.startsWith("- Layout:")) {
      layoutLine = line.slice("- Layout:".length).trim();
    } else if (line.startsWith("- Mistake bands:")) {
      bandsLine = line.slice("- Mistake bands:".length).trim();
    } else if (line.startsWith("- Hints:")) {
      hintsLine = line.slice("- Hints:".length).trim();
    } else if (line.startsWith("- Worked example:")) {
      workedExampleLine = line.slice("- Worked example:".length).trim();
    } else if (line.startsWith("|") && !line.startsWith("| #") && !line.startsWith("|---")) {
      tableLines.push(line);
    }
  }

  const instructions = parseSectionInstructions(instructionLine);
  const sectionCount = Math.max(1, instructions.length);
  const sectionLayoutClauses = splitSectionLayouts(layoutLine, sectionCount);
  const sectionLayoutInfos = sectionLayoutClauses.map(parseLayoutInfo);

  const workedExample = workedExampleLine ? parseWorkedExampleJson(workedExampleLine) : null;
  const hasReadAloudSec0 =
    sectionCount >= 2 &&
    (sectionLayoutInfos[0].isReadAloudSection ||
      /(?:read|chant).*(?:table|chart).*aloud/i.test(instructions[0] ?? ""));

  const rawRows: RawRow[] = [];
  for (const rowLine of tableLines) {
    const cells = rowLine
      .slice(1, rowLine.endsWith("|") ? -1 : undefined)
      .split("|")
      .map((c) => c.trim());
    if (cells.length < 3) continue;
    const rawId = cells[0];
    const dotMatch = /^(\d+)\.(\d+)$/.exec(rawId);
    let sectionIndex = 0;
    let n = rawRows.length + 1;
    if (dotMatch) {
      sectionIndex = Math.min(sectionCount - 1, Number(dotMatch[1]) - 1);
      n = Number(dotMatch[2]);
    } else if (/^\d+$/.test(rawId)) {
      sectionIndex = hasReadAloudSec0 ? 1 : 0;
      n = Number(rawId);
    }
    rawRows.push({ sectionIndex, n, rawId, question: cells[1], answer: cells[2] });
  }

  const answerDiffs: AnswerDiff[] = [];
  let computedItems = 0;
  let uncheckedItems = 0;
  let actionItems = 0;

  const sections: PageSection[] = [];
  const allExamples: Example[] = [];
  if (workedExample) allExamples.push(workedExample);

  for (let si = 0; si < sectionCount; si += 1) {
    const layoutInfo = sectionLayoutInfos[si];
    const rowsForSec = rawRows.filter((r) => r.sectionIndex === si);
    const items: PageItem[] = [];
    const extraScaffolds: Scaffold[] = [];

    const isTableSec = si === 0 && hasReadAloudSec0;
    const isLastSec = si === sectionCount - 1;
    const hintsForSec =
      isTableSec || (!hasReadAloudSec0 && isLastSec) || sectionCount === 1 ? hintsLine : undefined;
    const { scaffolds: parsedScaffolds, noteExamples } = parseHintsAndNoteExamples(
      hintsForSec,
      layoutInfo,
      isTableSec && workedExample !== null,
    );
    for (const ex of noteExamples) allExamples.push(ex);

    if (si === 0 && hasReadAloudSec0 && rowsForSec.length === 0) {
      actionItems += 1;
      items.push({
        n: 1,
        printed: instructions[si] || "Read aloud and check the box.",
        form: null,
        expr: null,
        responses: [
          {
            position: "checkbox",
            cue: NOT_STATED,
            answer: null,
            answer_source: "unchecked",
          },
        ],
      });
    }

    const parsedRows = rowsForSec.map((row) => ({ row, parsed: parseQuestionCell(row.question) }));
    const buildCtx = {
      sourceRef,
      sectionIndex: si,
      layoutInfo,
      parsedScaffolds,
      extraScaffolds,
      answerDiffs,
    };

    let rawToFinalN = new Map<number, number>();
    if (canPairRowsInSection(parsedRows, layoutInfo)) {
      const built = buildPairedSectionItems(parsedRows, buildCtx);
      items.push(...built.items);
      rawToFinalN = built.rawToFinalN;
      computedItems += built.counts.computedItems;
      uncheckedItems += built.counts.uncheckedItems;
    } else {
      const built = buildSingleSectionItems(parsedRows, buildCtx);
      items.push(...built.items);
      computedItems += built.counts.computedItems;
      uncheckedItems += built.counts.uncheckedItems;
    }

    let finalScaffolds: PageSection["scaffolds"];
    if (extraScaffolds.length > 0) {
      finalScaffolds = [
        ...(Array.isArray(parsedScaffolds) ? parsedScaffolds : []),
        ...extraScaffolds,
      ];
    } else {
      finalScaffolds = parsedScaffolds;
    }
    finalScaffolds = remapScaffolds(finalScaffolds, rawToFinalN);

    sections.push({
      instruction: instructions[si] ?? (si === 0 && !instructionLine ? NOT_STATED : null),
      scaffolds: finalScaffolds,
      items,
    });
  }

  const record: PageRecord = {
    kind: "page",
    source_ref: sourceRef,
    topic: {
      title: topicTitle,
      number: NOT_STATED,
    },
    sections,
    examples: allExamples.length > 0 ? allExamples : NOT_STATED,
    score_bands: parseScoreBands(bandsLine),
  };

  const notStatedFields = collectNotStatedFields(record);
  const totalSectionItems = sections.reduce((sum, sec) => sum + sec.items.length, 0);

  return {
    record,
    notStatedFields,
    answerDiffs,
    counts: {
      items: totalSectionItems,
      questionRows: rawRows.length,
      actionItems,
      computedItems,
      uncheckedItems,
      answerDiffs: answerDiffs.length,
    },
  };
}

export function parseLegacyMarkdown(
  markdown: string,
  opts: ParseLegacyOptions = {},
): LegacyConversionResult {
  const { source, level } = inferSourceAndLevel(markdown, opts);
  const contents = parseContentsTable(markdown, source, level);

  const pageChunks = `\n${markdown}`.split(/\r?\n####(?=[ \t]|$)/).slice(1);
  const pages = pageChunks.map((chunk) => parsePageBlock(chunk, source));

  if (!contents && pages.length === 0) {
    throw new Error("No page entries or contents table found in input.");
  }

  const seenRefs = new Set<string>();
  for (const page of pages) {
    if (seenRefs.has(page.record.source_ref)) {
      throw new Error(`Duplicate page reference "${page.record.source_ref}" found in input.`);
    }
    seenRefs.add(page.record.source_ref);
  }

  return { source, level, contents, pages };
}

export function formatConversionReport(result: LegacyConversionResult): string {
  const lines: string[] = [];
  const totalItems = result.pages.reduce((s, p) => s + p.counts.items, 0);
  const totalQuestionRows = result.pages.reduce((s, p) => s + p.counts.questionRows, 0);
  const totalActions = result.pages.reduce((s, p) => s + p.counts.actionItems, 0);
  const totalComputed = result.pages.reduce((s, p) => s + p.counts.computedItems, 0);
  const totalUnchecked = result.pages.reduce((s, p) => s + p.counts.uncheckedItems, 0);
  const totalDiffs = result.pages.reduce((s, p) => s + p.counts.answerDiffs, 0);

  lines.push(`# Conversion Report (${result.source}:${result.level})`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Contents records: ${result.contents ? 1 : 0}`);
  lines.push(`- Page records: ${result.pages.length}`);
  lines.push(
    `- Items: ${totalItems} (${totalQuestionRows} question rows, ${totalActions} action items)`,
  );
  lines.push(`- Computed items: ${totalComputed}`);
  lines.push(`- Unchecked question items: ${totalUnchecked}`);
  lines.push(`- Answer differences: ${totalDiffs}`);
  lines.push("");

  lines.push("## Per-page summary");
  lines.push("| Page | Items | Computed | Unchecked | Actions | Diffs | `not_stated` count |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const p of result.pages) {
    lines.push(
      `| ${p.record.source_ref} | ${p.counts.items} | ${p.counts.computedItems} | ${p.counts.uncheckedItems} | ${p.counts.actionItems} | ${p.counts.answerDiffs} | ${p.notStatedFields.length} |`,
    );
  }
  lines.push("");

  lines.push("## Answer differences");
  const allDiffs = result.pages.flatMap((p) => p.answerDiffs);
  if (allDiffs.length === 0) {
    lines.push("None.");
  } else {
    for (const d of allDiffs) {
      lines.push(
        `- ${d.sourceRef} item ${d.itemRef} (\`${d.printed}\`): file=${d.fileAnswer}, computed=${d.computedAnswer}`,
      );
    }
  }
  lines.push("");

  lines.push("## `not_stated` fields by page");
  for (const p of result.pages) {
    lines.push(`### ${p.record.source_ref}`);
    if (p.notStatedFields.length === 0) {
      lines.push("- None");
    } else {
      for (const field of p.notStatedFields) {
        lines.push(`- \`${field}\``);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
