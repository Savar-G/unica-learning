import { findUnstorableTextPath, type ValidationError } from "@/lib/reference-record";
import { checkAllowedKeys, isNonEmptyString, isPlainObject } from "@/lib/reference-record/validate-parts";
import { isPrinted, printedTexts, readSentenceText } from "./sentence-text";
import { SENTENCE_KINDS, type MethodKey, type MethodSentence, type TopicEvidence } from "./types";

const MAX_TEXT = 600;

export interface SummaryContext {
  key: MethodKey;
  evidence: TopicEvidence;
  // The trusted view of each page that gives facts (evidence.ts).
  views: ReadonlyMap<string, Record<string, unknown>>;
}

export type SummaryCheck = { ok: true; summary: MethodSentence[] } | { ok: false; errors: ValidationError[] };

type Fail = (message: string) => void;

function checkText(sentence: MethodSentence, ctx: SummaryContext, fail: Fail): void {
  const contentsRef = ctx.evidence.contents.ref;
  const { pages, math, errors } = readSentenceText(sentence.text, ctx.key);
  errors.forEach(fail);
  const token = (ref: string): string => `[${ref.split(":").at(-1)}]`;
  for (const ref of new Set(pages)) if (!sentence.cites.includes(ref)) fail(`${token(ref)} is not in "cites"`);
  for (const ref of sentence.cites) {
    if (ref !== contentsRef && !pages.includes(ref)) fail(`"${ref}" is cited, but the text has no token ${token(ref)}`);
  }
  if (sentence.guess) return;
  const texts = sentence.cites.flatMap((ref) => printedTexts(ctx.views.get(ref)));
  for (const fragment of math) {
    if (!isPrinted(fragment, texts)) fail(`no cited page prints \`${fragment}\` as a whole text or a whole side of "="`);
  }
}

// Only a worked example of the same step is a method (evidence.ts).
function checkSteps(sentence: MethodSentence, ctx: SummaryContext, fail: Fail): void {
  for (const id of sentence.steps ?? []) {
    const step = ctx.evidence.steps.find((s) => s.id === id);
    if (!step) fail(`"${id}" is not a step of this topic`);
    else if (!sentence.guess && !step.methods.some((m) => sentence.cites.includes(m.page))) {
      fail(`no cited page has a worked example of "${id}": leave this step out, or mark the sentence as a guess`);
    }
  }
}

function checkCites(sentence: MethodSentence, ctx: SummaryContext, fail: Fail): void {
  const { evidence } = ctx;
  if (sentence.cites.length === 0 && !sentence.guess) fail("needs a citation, or must be marked as a guess");
  if (new Set(sentence.cites).size !== sentence.cites.length) fail("a page is cited twice");
  for (const ref of sentence.cites) {
    if (ref === evidence.contents.ref) continue;
    const page = evidence.pages.find((p) => p.ref === ref);
    const missing = evidence.pages_without_photo.pages;
    if (!page && (!Array.isArray(missing) || !missing.includes(ref))) fail(`"${ref}" is not a page of this topic`);
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
  else if (/[\p{C}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u.test(value.text)) {
    fail("text", "must be one line with no invisible characters");
  } else if (value.text.length > MAX_TEXT) fail("text", `must have at most ${MAX_TEXT} characters`);
  if (!Array.isArray(value.cites) || !value.cites.every((c) => typeof c === "string")) {
    fail("cites", "must be a list of source_refs");
  }
  if ("guess" in value && value.guess !== true) fail("guess", "must be true, or left out");
  if (value.kind === "procedure") {
    const { steps } = value;
    if (!Array.isArray(steps) || steps.length === 0 || !steps.every(isNonEmptyString)) {
      fail("steps", "must be a non-empty list of step ids, because the sentence is a procedure");
    } else if (new Set(steps).size !== steps.length) fail("steps", "a step is named twice");
  } else if ("steps" in value) fail("steps", "only a procedure names its steps");
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
    const fail: Fail = (message) => void errors.push({ path, message });
    checkCites(sentence, ctx, fail);
    checkText(sentence, ctx, fail);
    checkSteps(sentence, ctx, fail);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, summary: value as MethodSentence[] };
}
