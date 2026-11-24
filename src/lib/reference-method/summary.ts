import { findUnstorableTextPath, type ValidationError } from "@/lib/reference-record";
import { checkAllowedKeys, isNonEmptyString, isPlainObject } from "@/lib/reference-record/validate-parts";
import { parsePageRef } from "./identity";
import { hasOtherDigits, numbersIn, readPageMentions, type PageMention } from "./numbers";
import { PAGE_SIDES, SENTENCE_KINDS, type MethodSentence, type TopicEvidence } from "./types";

const MAX_TEXT = 600;

export interface SummaryContext {
  // The number of the topic in the contents chart.
  topic: number;
  evidence: TopicEvidence;
  // The trusted view of each page that gives facts (evidence.ts).
  views: ReadonlyMap<string, Record<string, unknown>>;
}

export type SummaryCheck = { ok: true; summary: MethodSentence[] } | { ok: false; errors: ValidationError[] };

// Fields that hold the place of something on a page, not what the page shows, and the score bands.
const NOT_CONTENT = new Set(["n", "applies_to", "step", "score_bands", "source_ref", "kind"]);

function collectText(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "number") out.push(String(value));
  else if (Array.isArray(value)) value.forEach((child) => collectText(child, out));
  else if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      // "step" is a number on an example mark (a place), and the jump of a chain (content).
      if (NOT_CONTENT.has(key) && !(key === "step" && value.kind === "chain")) continue;
      collectText(child, out);
    }
  }
}

// The texts and numbers of the cited records and of the facts that code took from them.
function evidenceTexts(cites: readonly string[], ctx: SummaryContext): string[] {
  const { evidence, views } = ctx;
  const out: string[] = [];
  for (const ref of cites) {
    if (ref === evidence.contents.ref) {
      collectText([evidence.topic.title, evidence.topic.sheet_range, evidence.topic.std_time_min], out);
      continue;
    }
    collectText(views.get(ref), out);
    const sheet = evidence.sheets.find((s) => s.page === ref);
    collectText([sheet?.questions, sheet?.steps.map((s) => s.questions)], out);
    collectText(
      evidence.steps.filter((s) => s.pages.includes(ref)).map((s) => s.features),
      out,
    );
  }
  return out;
}

function describeMention(mention: PageMention): string {
  return mention.side ? `page ${mention.sheet}${mention.side}` : `sheet ${mention.sheet}`;
}

function checkText(sentence: MethodSentence, ctx: SummaryContext, fail: (message: string) => void): void {
  const { evidence } = ctx;
  if (hasOtherDigits(sentence.text)) {
    fail("write numbers with the digits 0 to 9 only");
    return;
  }
  const texts = evidenceTexts(sentence.cites, ctx);
  const cited = sentence.cites.flatMap((ref) => {
    const parsed = parsePageRef(ref);
    return parsed.ok ? [parsed.page] : [];
  });
  const sides = new Set<string>([...PAGE_SIDES, ...cited.map((page) => page.side)]);
  const topicPages = [...evidence.pages.map((p) => p.ref), ...(Array.isArray(evidence.pages_without_photo) ? evidence.pages_without_photo : [])];
  const isTerm = (token: string): boolean =>
    !topicPages.some((ref) => ref.endsWith(`:${token.toLowerCase()}`)) &&
    texts.some((text) => new RegExp(`(?<![A-Za-z0-9])${token}(?![A-Za-z0-9])`).test(text));
  const { mentions, rest } = readPageMentions(sentence.text, sides, isTerm);
  for (const mention of mentions) {
    const ok = cited.some((p) => p.sheet === mention.sheet && (!mention.side || p.side === mention.side));
    if (ok) continue;
    const known = evidence.pages.some(({ ref }) => {
      const parsed = parsePageRef(ref);
      return parsed.ok && parsed.page.sheet === mention.sheet && (!mention.side || parsed.page.side === mention.side);
    });
    fail(
      `names ${describeMention(mention)}, which ${known ? "it does not cite" : "has no photo in this topic"}: cite each sheet that it names, or mark it as a guess`,
    );
  }
  const numbers = new Set(texts.flatMap(numbersIn));
  if (sentence.cites.includes(evidence.contents.ref)) numbers.add(String(ctx.topic));
  for (const number of new Set(numbersIn(rest))) {
    if (!numbers.has(number)) fail(`the number ${number} is in none of the cited records or facts`);
  }
}

// A procedure is about the steps it names, or about every step of its cited pages. Each of them must be
// shown on a cited page, so a step with no method never gets one.
function checkProcedure(sentence: MethodSentence, ctx: SummaryContext, fail: (message: string) => void): void {
  const { steps } = ctx.evidence;
  const about = sentence.steps ?? steps.filter((s) => s.pages.some((p) => sentence.cites.includes(p))).map((s) => s.id);
  if (about.length === 0) fail("a procedure must cite a page with a step, or be a guess");
  for (const id of about) {
    const step = steps.find((s) => s.id === id);
    if (!step) {
      fail(`"${id}" is not a step of this topic`);
    } else if (!step.shown_on.some((ref) => sentence.cites.includes(ref))) {
      fail(
        `no cited page shows a method for the step "${id}": name the steps that it is about in "steps", cite a page that shows them, or mark it as a guess`,
      );
    }
  }
}

function checkCites(sentence: MethodSentence, ctx: SummaryContext, fail: (message: string) => void): void {
  const { evidence } = ctx;
  if (sentence.cites.length === 0 && !sentence.guess) fail("needs a citation, or must be marked as a guess");
  if (new Set(sentence.cites).size !== sentence.cites.length) fail("a page is cited twice");
  for (const ref of sentence.cites) {
    if (ref === evidence.contents.ref) continue;
    const page = evidence.pages.find((p) => p.ref === ref);
    const missing = Array.isArray(evidence.pages_without_photo) && evidence.pages_without_photo.includes(ref);
    if (!page && !missing) fail(`"${ref}" is not a page of this topic`);
    else if (sentence.guess) continue;
    else if (!page) fail(`"${ref}" has no photo: mark the sentence as a guess`);
    else if (page.facts === "withheld") fail(`"${ref}" gives no facts (${page.status}): mark the sentence as a guess`);
  }
}

function checkShape(value: unknown, path: string, errors: ValidationError[]): MethodSentence | null {
  const before = errors.length;
  const fail = (field: string, message: string): void => void errors.push({ path: field ? `${path}.${field}` : path, message });
  if (!isPlainObject(value)) {
    fail("", "must be a sentence object");
    return null;
  }
  checkAllowedKeys(value, ["kind", "text", "cites", "guess", "steps"], path, errors);
  if (!(SENTENCE_KINDS as readonly unknown[]).includes(value.kind)) {
    fail("kind", `must be one of ${SENTENCE_KINDS.join(", ")}`);
  }
  if (!isNonEmptyString(value.text)) fail("text", "must be a non-empty text");
  else if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value.text)) fail("text", "must be one line with no invisible characters");
  else if (value.text.length > MAX_TEXT) fail("text", `must have at most ${MAX_TEXT} characters`);
  if (!Array.isArray(value.cites) || !value.cites.every((c) => typeof c === "string")) {
    fail("cites", "must be a list of source_refs");
  }
  if ("guess" in value && value.guess !== true) fail("guess", "must be true, or left out");
  if ("steps" in value) {
    if (!Array.isArray(value.steps) || value.steps.length === 0 || !value.steps.every(isNonEmptyString)) {
      fail("steps", "must be a non-empty list of step ids");
    }
    if (value.kind !== "procedure") fail("steps", "only a procedure names its steps");
  }
  return errors.length === before ? (value as unknown as MethodSentence) : null;
}

export function checkSummary(value: unknown, ctx: SummaryContext): SummaryCheck {
  const errors: ValidationError[] = [];
  if (!Array.isArray(value)) return { ok: false, errors: [{ path: "sentences", message: "must be a list of sentences" }] };
  const damaged = findUnstorableTextPath(value, "sentences");
  if (damaged !== null) return { ok: false, errors: [{ path: damaged, message: "holds damaged text" }] };
  if (value.length === 0 && ctx.views.size > 0) {
    errors.push({ path: "sentences", message: "must have at least one sentence" });
  }
  value.forEach((entry, i) => {
    const path = `sentences[${i}]`;
    const sentence = checkShape(entry, path, errors);
    if (!sentence) return;
    const fail = (message: string): void => void errors.push({ path, message });
    checkCites(sentence, ctx, fail);
    if (sentence.guess) return;
    checkText(sentence, ctx, fail);
    if (sentence.kind === "procedure") checkProcedure(sentence, ctx, fail);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, summary: value as MethodSentence[] };
}
