import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Window } from "happy-dom";
import sharp, { type OverlayOptions } from "sharp";
import { renderableDraft } from "@/lib/workbook-fit";
import type { GeneratedWorkbook } from "@/lib/workbook-generator";
import type { RenderProblem, WorkbookTemplate } from "@/lib/workbook-render";
import { createSession } from "@/lib/maya/session";
import { teachingContext, type TeachingFrame } from "@/lib/workbook-print-contract";

/** Count the same permanent teaching context approval stores, including every excluded question. */
export function masteryCoverageMarkdown(draft: GeneratedWorkbook, frame: TeachingFrame): string {
  const groups = new Map<string, { total: number; excluded: number; noStep: number }>();
  for (const page of draft.pages) for (const q of page.questions) {
    const teaching = q.package ? teachingContext(frame, page, { ...q, package: q.package }) : null;
    for (const kind of ["All", q.place ?? q.part]) {
      const row = groups.get(kind) ?? { total: 0, excluded: 0, noStep: 0 };
      row.total++;
      if (!teaching?.eligibility.mastery) row.excluded++;
      if (teaching?.eligibility.reason === "no-item-step") row.noStep++;
      groups.set(kind, row);
    }
  }
  return ["## Mastery exclusions (#597)", "", "| Kind | Questions | Excluded | No tested step |", "|---|---:|---:|---:|",
    ...[...groups].sort(([a], [b]) => a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b))
      .map(([kind, row]) => `| ${kind} | ${row.total} | ${row.excluded} | ${row.noStep} |`), "",
    "Excluded includes missing context, unscored items, parent checks and Try first. A review-step list does not identify a tested step.", ""].join("\n");
}
import { printedWorkbookQuestion } from "@/lib/workbook-maya-operation";

export interface MayaCoverage {
  level: string;
  kind: string;
  questions: number;
  operations: number;
  accepted: number;
}

/** Count every question, including failed or absent packages, through Maya's public session entry point. */
export function mayaCoverage(draft: GeneratedWorkbook): MayaCoverage[] {
  const groups = new Map<string, MayaCoverage>();
  for (const page of draft.pages) for (const question of page.questions) {
    const pkg = question.package;
    const level = pkg ? `U${pkg.level}` : draft.levels.map(n => `U${n}`).join(", ");
    const kind = pkg?.templateId?.match(/#[0-9]+\.[0-9]+:([a-z-]+)$/)?.[1] ?? pkg?.item?.format ?? "no package";
    const operation = pkg?.operation ? 1 : 0;
    const accepted = createSession({ callId: "sample-coverage", package: pkg }).contentProblem === null ? 1 : 0;
    for (const groupKind of ["All", kind]) {
      const key = `${level}:${groupKind}`;
      const row = groups.get(key) ?? { level, kind: groupKind, questions: 0, operations: 0, accepted: 0 };
      row.questions++; row.operations += operation; row.accepted += accepted;
      groups.set(key, row);
    }
  }
  return [...groups.values()].sort((a, b) => Number(a.level.slice(1)) - Number(b.level.slice(1)) || (a.kind === "All" ? -1 : b.kind === "All" ? 1 : a.kind.localeCompare(b.kind)));
}

export function mayaCoverageMarkdown(rows: MayaCoverage[]): string {
  return ["## Maya coverage", "", "| Level | Question kind | Questions | With operation | Maya accepts |", "|---|---|---:|---:|---:|",
    ...rows.map(r => `| ${r.level} | ${r.kind} | ${r.questions} | ${r.operations} | ${r.accepted} |`), "",
    "Maya accepts means createSession accepts the checked package. This count does not test a model or voice call.", ""].join("\n");
}

export interface SamplePage {
  number: number;
  kind: string;
  title: string;
  instruction: string;
  text: string;
  layout: string;
  warnings: string[];
}

/** Read the actual template HTML in DOM order. This does not run a browser or execute scripts. */
export async function samplePages(draft: GeneratedWorkbook, template: WorkbookTemplate, problems: RenderProblem[]): Promise<SamplePage[]> {
  const book = renderableDraft(draft);
  const window = new Window({ settings: {
    disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true,
    disableCSSFileLoading: true, disableIframePageLoading: true,
  } });
  try { return book.pages.map(page => {
    const source = draft.pages.find(p => p.number === page.number)!;
    // Desk tokens and random storage IDs do not affect a page's text or layout.
    const html = template.page(page, { qr: "", qrUrl: "SAMPLE_QR" }, book) ?? "";
    const body = window.document.createElement("div");
    body.innerHTML = html;
    body.querySelectorAll("style,script,svg").forEach(element => element.remove());
    // Separate rows, operands and block text before reading textContent.
    body.querySelectorAll("br").forEach(element => element.replaceWith("\n"));
    body.querySelectorAll("div,p,span,section,h1,h2,li,td").forEach(element => element.append(" "));
    const clean = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
    const title = clean(body.querySelector('[data-measure="slot-title"], [data-measure="slot-cover-title"], h1')?.textContent);
    const instruction = clean(body.querySelector('[data-measure="slot-subtitle"]')?.textContent);
    const questions = [...body.querySelectorAll("[data-measure]")].flatMap(element => {
      const match = /^question-(\d+)$/.exec(element.getAttribute("data-measure") ?? "");
      if (!match) return [];
      const question = source.questions.find(q => q.number === Number(match[1]));
      if (!question) return [];
      const pkg = question.package ? printedWorkbookQuestion(question.package) : null;
      return [
        `### Question ${question.number}`,
        `Printed: ${clean(element.textContent)}`,
        `Question text: ${pkg?.text ?? "[no package]"}`,
        `Choices: ${JSON.stringify(pkg?.item?.regions.filter(r => r.kind === "choice") ?? [])}`,
        `Answer: ${JSON.stringify({ answer: pkg?.answer ?? null, regions: pkg?.item?.regions ?? [] })}`,
        `Check: ${JSON.stringify(question.check)}`,
        "",
      ].join("\n");
    });
    const warnings = [
      ...problems.filter(p => p.page === page.number).map(p => p.reason),
      ...(source.fit.status === "failed" ? source.fit.problems.map(p => p.reason) : []),
      ...source.questions.filter(q => q.check.status !== "checked").map(q => `Question ${q.number}: ${JSON.stringify(q.check)}`),
      ...(source.omissions ?? []).map(o => `Omission: ${JSON.stringify(o)}`),
      ...(source.leftOut ?? []).map(o => `Left out: ${JSON.stringify(o)}`),
    ];
    const text = [`All printed text: ${clean(body.textContent)}`, "", ...questions].join("\n");
    return { number: page.number, kind: page.type, title, instruction, text, warnings,
      // (A scan mark's measure name prints nothing, so it does not count as a layout change.)
      layout: createHash("sha256").update(template.css).update(html.replace(/ data-measure="scan-[a-z]+"/g, "")).digest("hex") };
  }); } finally { await window.happyDOM.close(); }
}

export function pagesMarkdown(label: string, pages: SamplePage[], coverage?: MayaCoverage[]): string {
  return [`# ${label} printed pages`, "", ...(coverage ? [mayaCoverageMarkdown(coverage)] : []), ...pages.flatMap(page => [
    `## Page ${page.number}: ${page.kind}`, `Title: ${page.title}`, `Instruction: ${page.instruction}`, "", page.text,
    ...page.warnings.map(warning => `Warning: ${warning}`), "",
  ])].join("\n");
}

export function changedPages(before: SamplePage[], after: SamplePage[]) {
  return [...new Set([...before.map(p => p.number), ...after.map(p => p.number)])].flatMap(number => {
    const old = before.find(p => p.number === number);
    const current = after.find(p => p.number === number);
    const reasons: string[] = [];
    if (!old) reasons.push("added");
    else if (!current) reasons.push("removed");
    else {
      if (JSON.stringify([old.kind, old.title, old.instruction, old.text]) !== JSON.stringify([current.kind, current.title, current.instruction, current.text])) reasons.push("text or answer");
      if (old.layout !== current.layout) reasons.push("layout input");
      if (JSON.stringify(old.warnings) !== JSON.stringify(current.warnings)) reasons.push("warnings");
    }
    return reasons.length ? [{ number, reasons, before: old, after: current }] : [];
  });
}

/** One sheet, with each changed page's before/after pair. Removed pages keep their before image. */
export async function writePageDiff(o: { label: string; before: string; out: string; pages: SamplePage[] }) {
  const old: SamplePage[] = JSON.parse(await readFile(`${o.before}/${o.label}-pages.json`, "utf8"));
  const changed = changedPages(old, o.pages);
  await writeFile(`${o.out}/${o.label}-diff.md`, [
    `# ${o.label} page changes`, "", `Compared with ${o.before}. Changed pages: ${changed.length}.`, "",
    ...changed.map(p => `- Page ${p.number}: ${p.after?.kind ?? p.before?.kind}: ${p.reasons.join(", ")}`), "",
    "Layout compares the exact template HTML and CSS, with desk tokens removed. A CSS change can mark all pages.", "",
  ].join("\n"));
  const width = 340, height = 440, gap = 16, labelHeight = 26;
  const tiles: OverlayOptions[] = [];
  for (const [row, page] of changed.entries()) {
    for (const [column, side] of ["before", "after"].entries()) {
      const folder = side === "before" ? o.before : o.out;
      const exists = side === "before" ? page.before : page.after;
      const left = gap + column * (width + gap), top = gap + row * (height + labelHeight + gap);
      const label = Buffer.from(`<svg width="${width}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0C0C0E"/><text x="8" y="18" fill="white" font-family="Helvetica" font-size="14">p${page.number} ${side}${exists ? "" : " (no page)"}</text></svg>`);
      tiles.push({ input: label, left, top });
      if (exists) {
        const path = `${folder}/pages/${o.label}/p${String(page.number).padStart(2, "0")}.png`;
        // An absent source image is allowed for a check-only or older sample. Other I/O errors are real failures.
        const bytes = await readFile(path).catch(error => { if (error.code === "ENOENT") return null; throw error; });
        if (bytes) tiles.push({ input: await sharp(bytes).resize(width, height).toBuffer(), left, top: top + labelHeight });
      }
    }
  }
  if (!changed.length) {
    tiles.push({ input: Buffer.from('<svg width="696" height="48"><text x="16" y="30" font-family="Helvetica" font-size="18">No changed pages.</text></svg>'), left: 0, top: 0 });
  }
  await sharp({ create: { width: 2 * width + 3 * gap, height: Math.max(64, gap + changed.length * (height + labelHeight + gap)), channels: 3, background: "#E9E7E1" } })
    .composite(tiles).png().toFile(`${o.out}/${o.label}-changed.png`);
  return changed.map(p => p.number);
}
