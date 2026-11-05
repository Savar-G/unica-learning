// The print contract (#536, S2a of #455): what a later photo of a printed page is read against. It is captured at render
// and frozen at approval, so it never comes from a later template, a current child profile or a page heading:
// - a page's contract: where the four scan marks printed, in declared units, with the image and content fingerprints;
// - each question's regions: where each answer region printed. A region id names a part of an item, not an attempt;
// - each question's teaching context: the planned part and slot, curriculum version, unit, skill, step and eligibility;
// - the book's manifest: the pages a family must scan for each printed day, and the level test's pages.
// `printedRevision` joins them with the PDF's fingerprint into one identity. Any change gives a new revision, so an old
// photo (which keeps the revision it was identified against) cannot use a new revision's calibration.
//
// A book with no revision is a legacy book: its photos stay attached and automatic marking stays unavailable
// (printContractForPhoto). Never render a stored book again to invent its contract.
// Pure TypeScript: no Next.js, React, network, database or clock.
import { digestOf } from "@/lib/workbook-digest";
import { packageItem, type QuestionPackage } from "@/lib/question-package";
import type { PageContent } from "@/lib/workbook-page";
import type { PlannedPage, PlannedPart, WorkbookPlan } from "@/lib/workbook-plan";

export const PRINT_CONTRACT_VERSION = 1;
export const TEACHING_CONTEXT_VERSION = 1;
export const SCAN_MANIFEST_VERSION = 1;

/** The scan marks in their correspondence order: clockwise from the top left. A photo's four marks map in this order. */
export const SCAN_MARKS = ["tl", "tr", "br", "bl"] as const;
export type ScanMark = (typeof SCAN_MARKS)[number];

/** The `data-measure` name of a scan mark. */
export const scanMarkName = (m: ScanMark) => `scan-${m}`;
export const isScanMarkName = (name: string) => name.startsWith("scan-");

/** A printed day whose required pages trigger the next workbook's snapshot (D-213); the test workbook's level test day. */
export const SNAPSHOT_DAY = 7;

const PAGE_TYPES_NEVER_REQUIRED = new Set(["cover", "how-plan", "back-cover", "blank"]);

/** How far measured marks may differ and still count as lined up, in CSS pixels (the renderer's sub-pixel margin). */
const MARK_TOLERANCE = 0.5;

export interface Point { x: number; y: number }
export interface Box extends Point { width: number; height: number }

export interface PagePrintContract {
  version: number;
  workbookId: string;
  /** The page's number, which runs through the whole workbook. */
  page: number;
  /** The printed page ID (D-187), or null when the page's content names none. */
  label: string | null;
  /** The printed day and the page of that day; null for covers, padding and extra practice. */
  day: number | null;
  pageOfDay: number | null;
  /** How to read every coordinate of this contract and of the page's regions. */
  coordinates: {
    units: "image-px";
    origin: "top-left";
    x: "right";
    y: "down";
    orientation: "portrait";
    image: { width: number; height: number };
    /** The CSS page the template laid out, and image pixels per CSS pixel. */
    cssPage: { width: number; height: number };
    scale: { x: number; y: number };
  };
  marks: {
    /** Each coordinate names the outer corner of its L-shaped mark: the corner nearest the sheet's corner. */
    anchor: "outer-corner";
    order: ScanMark[];
    points: Record<ScanMark, Point>;
  };
  fingerprints: {
    /** digestOf the page's printed content. */
    content: string;
    /** SHA-256 of the page image's bytes. */
    image: string;
  };
}

/** One answer region as printed. `box` is null when the template did not measure it on the page. */
export interface PrintedRegion {
  id: string;
  kind: string;
  box: Box | null;
}

export type MasteryReason = "not-scorable" | "parent-checked" | "try-first" | "no-item-step";

/** One curriculum step, whole: its unit, its skill and its number. Never parts of two steps; null when one is not known. */
export interface StepReference {
  unit: string;
  skill: string;
  step: number;
}

/** A declaration by the builder that was asked to construct this exact skill and step. */
export interface StepDeclaration {
  source: "template" | "code" | "warm-up";
  reference: StepReference;
}

export interface TeachingContext {
  version: number;
  curriculum: { key: string; version: string };
  /** The template slot the question sits in ("now-you", "try-first"), or null on a book not laid out for the templates. */
  practiceType: string | null;
  /** The planned part it fills, and its slot ("<part>.<item>"). */
  part: string;
  slot: string;
  /** Part of an optional block (D-233). */
  extra: boolean;
  /** The planned part's unit track ("A", "B"), or null. */
  track: string | null;
  /** The step the planned part teaches, or null for review and mixed parts. Never a worked-solution step id. */
  plannedStep: StepReference | null;
  /**
   * The step the question really tests: marking events and the next book read this one. It is the step of the item's
   * template, or the planned step for an item written on that step's skill; null when neither is known.
   */
  itemStep: StepReference | null;
  /** The steps a review slot may draw from ("<skill>#<step>"). */
  reviewSteps: string[];
  eligibility: {
    format: string;
    scorable: boolean;
    parentChecked: boolean;
    /** Whether a checked result may count toward mastery. */
    mastery: boolean;
    reason: MasteryReason | null;
  };
}

export interface ScanManifest {
  version: number;
  curriculum: { key: string; version: string };
  testWorkbook: boolean;
  snapshotDay: number;
  /** The pages each printed day requires, by page number. Covers, padding and extra practice never enter. */
  days: { day: number; pages: number[] }[];
  /** The level test's pages: the test workbook's Day 7 only. */
  levelTest: { day: number; pages: number[] } | null;
}

// ---------- Fingerprints ----------

/** A JSON value in one form whatever its key order: a stored jsonb value gives the same text as the value stored. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}

const fingerprint = (value: unknown) => digestOf(canonical(value));

/** The SHA-256 of a file's bytes, as hex. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** What a page prints from: its place, QR token, questions and template content. */
export interface PrintedContent {
  number: number;
  dayLabel: string | null;
  type: string;
  qrToken: string;
  questions: { number: number; package: unknown }[];
  content?: unknown;
}

export const pageContentFingerprint = (p: PrintedContent) => fingerprint({
  number: p.number, dayLabel: p.dayLabel, type: p.type, qrToken: p.qrToken,
  questions: p.questions.map((q) => ({ number: q.number, package: q.package })), content: p.content ?? null,
});

// ---------- The page contract ----------

const close = (a: number, b: number) => Math.abs(a - b) <= MARK_TOLERANCE;
const milli = (n: number) => Math.round(n * 1000) / 1000;

interface MarkRect extends Box { name: string; visible: boolean }

/** Why these measured marks cannot calibrate a photo of the page, or null. */
export function scanMarkProblem(marks: readonly MarkRect[], css: { width: number; height: number }): string | null {
  if (marks.length === 0) return "the page has no scan marks";
  const wanted = new Set(SCAN_MARKS.map(scanMarkName));
  const unknown = marks.find((m) => !wanted.has(m.name));
  if (unknown) return `the page has an unknown scan mark, ${unknown.name}`;
  const found = new Map<string, MarkRect>();
  for (const m of marks) {
    if (found.has(m.name)) return `the page marks ${m.name} more than once`;
    found.set(m.name, m);
  }
  for (const name of wanted) if (!found.has(name)) return `the page has no ${name}`;
  for (const m of marks) {
    if (!m.visible) return `${m.name} is hidden`;
    if (!(m.width > 0 && m.height > 0)) return `${m.name} has no size`;
    if (m.x < -MARK_TOLERANCE || m.y < -MARK_TOLERANCE || m.x + m.width > css.width + MARK_TOLERANCE || m.y + m.height > css.height + MARK_TOLERANCE) return `${m.name} is off the page`;
  }
  const [tl, tr, br, bl] = SCAN_MARKS.map((m) => found.get(scanMarkName(m))!);
  if (!close(tl.width, tr.width) || !close(tl.width, br.width) || !close(tl.width, bl.width)
    || !close(tl.height, tr.height) || !close(tl.height, br.height) || !close(tl.height, bl.height)) return "the scan marks are not the same size";
  const right = (m: Box) => m.x + m.width;
  const bottom = (m: Box) => m.y + m.height;
  if (!close(tl.x, bl.x) || !close(right(tr), right(br)) || !close(tl.y, tr.y) || !close(bottom(bl), bottom(br))) return "the scan marks do not form a rectangle";
  if (right(tr) - tl.x < css.width / 2 || bottom(bl) - tl.y < css.height / 2) return "the scan marks are not at the page's corners";
  return null;
}

/**
 * A page's contract from its measured marks, or why it has none. Missing, duplicate, off-page and inconsistent marks,
 * or an image that is not the CSS page at one scale, give no contract: the page prints, and automatic marking is
 * unavailable for it.
 */
export function buildPrintContract(o: {
  workbookId: string; page: PrintedContent & { content?: PageContent }; marks: readonly MarkRect[];
  image: { width: number; height: number; sha256: string }; css: { width: number; height: number };
}): { contract: PagePrintContract; problem: null } | { contract: null; problem: string } {
  const problem = scanMarkProblem(o.marks, o.css);
  if (problem) return { contract: null, problem };
  const { width, height } = o.image;
  if (!(width > 0 && height > 0) || height <= width) return { contract: null, problem: "the page image is not portrait" };
  const scale = { x: width / o.css.width, y: height / o.css.height };
  if (Math.abs(scale.x / scale.y - 1) > 0.01) return { contract: null, problem: "the page image is not the page at one scale" };
  const rect = (m: ScanMark) => o.marks.find((x) => x.name === scanMarkName(m))!;
  const at = (m: ScanMark, x: number, y: number): [ScanMark, Point] => [m, { x: milli(x * scale.x), y: milli(y * scale.y) }];
  const c = o.page.content;
  const day = c?.kind === "day" && !c.extraPractice ? c : null;
  return {
    problem: null,
    contract: {
      version: PRINT_CONTRACT_VERSION, workbookId: o.workbookId, page: o.page.number, label: c?.id ?? null,
      day: day?.day ?? null, pageOfDay: day?.page ?? null,
      coordinates: {
        units: "image-px", origin: "top-left", x: "right", y: "down", orientation: "portrait",
        image: { width, height }, cssPage: { width: o.css.width, height: o.css.height }, scale,
      },
      marks: {
        anchor: "outer-corner", order: [...SCAN_MARKS],
        points: Object.fromEntries([
          at("tl", rect("tl").x, rect("tl").y),
          at("tr", rect("tr").x + rect("tr").width, rect("tr").y),
          at("br", rect("br").x + rect("br").width, rect("br").y + rect("br").height),
          at("bl", rect("bl").x, rect("bl").y + rect("bl").height),
        ]) as Record<ScanMark, Point>,
      },
      fingerprints: { content: pageContentFingerprint(o.page), image: o.image.sha256 },
    },
  };
}

/** A measured rect in the contract's units: image pixels, to a thousandth. */
export const imageBox = (m: Box, scale: { x: number; y: number }): Box => ({
  x: milli(m.x * scale.x), y: milli(m.y * scale.y), width: milli(m.width * scale.x), height: milli(m.height * scale.y),
});

// ---------- Checks both stores share ----------

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const HEX_64 = /^[0-9a-f]{64}$/;
/** A printed revision: digestOf's 28 hex characters, never a timestamp. */
const REVISION = /^[0-9a-f]{28}$/;

export const isSha256 = (v: unknown): v is string => typeof v === "string" && HEX_64.test(v);
export const isPrintedRevision = (v: unknown): v is string => typeof v === "string" && REVISION.test(v);

const pointInside = (p: unknown, image: { width: number; height: number }) =>
  isObject(p) && isNumber(p.x) && isNumber(p.y) && p.x >= 0 && p.y >= 0 && p.x <= image.width && p.y <= image.height;

/** What is wrong with a stored or written contract, or null. `at`: the workbook, page and image it must name. */
export function printContractProblem(c: unknown, at: { workbookId: string; page: number; image: { width: number; height: number } | null }): string | null {
  if (!isObject(c)) return "the print contract is not an object";
  if (c.version !== PRINT_CONTRACT_VERSION) return "the print contract is of a version this code does not read";
  if (c.workbookId !== at.workbookId || c.page !== at.page) return "the print contract names another page";
  const coordinates = c.coordinates, marks = c.marks, fingerprints = c.fingerprints;
  if (!isObject(coordinates) || !isObject(marks) || !isObject(fingerprints)) return "the print contract is not complete";
  if (coordinates.units !== "image-px" || coordinates.origin !== "top-left" || coordinates.x !== "right" || coordinates.y !== "down" || coordinates.orientation !== "portrait") {
    return "the print contract's coordinates are not the declared ones";
  }
  const image = coordinates.image as { width?: unknown; height?: unknown } | undefined;
  if (!at.image || image?.width !== at.image.width || image?.height !== at.image.height) return "the print contract's image size is not the page image's";
  const scale = coordinates.scale as { x?: unknown; y?: unknown } | undefined;
  if (!isNumber(scale?.x) || !isNumber(scale?.y) || scale.x <= 0 || scale.y <= 0) return "the print contract has no image scale";
  if (marks.anchor !== "outer-corner" || JSON.stringify(marks.order) !== JSON.stringify(SCAN_MARKS)) return "the print contract's marks are not in the declared order";
  const points = marks.points;
  if (!isObject(points) || !SCAN_MARKS.every((m) => pointInside(points[m], at.image!))) return "a scan mark is not on the page image";
  const p = points as unknown as Record<ScanMark, Point>;
  const tolerance = MARK_TOLERANCE * Math.max(scale.x, scale.y);
  const near = (a: number, b: number) => Math.abs(a - b) <= tolerance;
  if (!near(p.tl.x, p.bl.x) || !near(p.tr.x, p.br.x) || !near(p.tl.y, p.tr.y) || !near(p.bl.y, p.br.y) || p.tl.x >= p.tr.x || p.tl.y >= p.bl.y) {
    return "the scan marks do not form a rectangle";
  }
  if (typeof fingerprints.content !== "string" || !isSha256(fingerprints.image)) return "the print contract has no fingerprints";
  return null;
}

/** What is wrong with a question's regions, or null. */
export function regionsProblem(regions: unknown, image: { width: number; height: number } | null): string | null {
  if (!Array.isArray(regions)) return "the regions are not a list";
  const ids = new Set<string>();
  for (const r of regions as PrintedRegion[]) {
    if (!isObject(r) || typeof r.id !== "string" || r.id === "" || typeof r.kind !== "string") return "a region has no id or kind";
    if (ids.has(r.id)) return `region ${r.id} is listed twice`;
    ids.add(r.id);
    if (r.box === null) continue;
    const b = r.box;
    if (!isObject(b) || ![b.x, b.y, b.width, b.height].every(isNumber) || b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0) return `region ${r.id}'s box is not a box`;
    // (A thousandth over: a box rounded to the contract's precision.)
    if (!image || b.x + b.width > image.width + 0.01 || b.y + b.height > image.height + 0.01) return `region ${r.id}'s box is not inside the page image`;
  }
  return null;
}

const isStepReference = (r: unknown): r is StepReference =>
  isObject(r) && typeof r.unit === "string" && r.unit !== "" && typeof r.skill === "string" && r.skill !== "" && Number.isInteger(r.step) && (r.step as number) >= 1;

const isTeaching = (t: unknown): t is TeachingContext =>
  isObject(t) && t.version === TEACHING_CONTEXT_VERSION && isObject(t.curriculum) && typeof t.slot === "string" && isObject(t.eligibility)
  && typeof t.eligibility.mastery === "boolean" && typeof t.eligibility.scorable === "boolean"
  && (t.plannedStep === null || isStepReference(t.plannedStep)) && (t.itemStep === null || isStepReference(t.itemStep))
  // (Mastery counts toward a step, so it needs that step.)
  && (t.itemStep !== null || !t.eligibility.mastery);

export const teachingProblem = (t: unknown) => (isTeaching(t) ? null : "the teaching context is not of a version this code reads");

/** A stored value of each part, or null when this code cannot trust it: the book then has no automatic marking there. */
export const storedPrintContract = (v: unknown, at: Parameters<typeof printContractProblem>[1]) =>
  (printContractProblem(v, at) === null ? (v as PagePrintContract) : null);
export const storedRegions = (v: unknown, image: { width: number; height: number } | null) =>
  (regionsProblem(v, image) === null ? (v as PrintedRegion[]) : null);
export const storedTeaching = (v: unknown) => (isTeaching(v) ? v : null);

interface ManifestPage {
  number: number;
  type: string;
  dayLabel: string | null;
  questions: readonly unknown[];
}

/**
 * What is wrong with a manifest against the printed pages, or null. Only a Day N page with questions enters a required
 * set; no page is in two days; a level test is the whole of Day 7's required set.
 */
export function manifestProblem(m: unknown, pages: readonly ManifestPage[]): string | null {
  if (!isObject(m) || m.version !== SCAN_MANIFEST_VERSION || !Array.isArray(m.days) || !isObject(m.curriculum)) return "the scan manifest is not of a version this code reads";
  const byNumber = new Map(pages.map((p) => [p.number, p]));
  const seen = new Set<number>();
  const days = m.days as { day: number; pages: number[] }[];
  if (days.length === 0) return "the scan manifest has no days";
  for (const d of days) {
    if (!Number.isInteger(d?.day) || d.day < 1 || !Array.isArray(d.pages) || d.pages.length === 0) return "a day of the scan manifest has no pages";
    for (const n of d.pages) {
      const p = byNumber.get(n);
      if (!p) return `the scan manifest names page ${n}, which is not in the book`;
      if (PAGE_TYPES_NEVER_REQUIRED.has(p.type) || p.dayLabel !== `Day ${d.day}`) return `page ${n} is not a page of Day ${d.day}`;
      if (p.questions.length === 0) return `page ${n} has no questions to scan`;
      if (seen.has(n)) return `the scan manifest names page ${n} twice`;
      seen.add(n);
    }
  }
  const test = m.levelTest;
  if (test !== null) {
    if (!isObject(test) || test.day !== SNAPSHOT_DAY || !Array.isArray(test.pages)) return "the level test is not on Day 7";
    const required = days.find((d) => d.day === SNAPSHOT_DAY)?.pages ?? [];
    if (test.pages.length === 0 || JSON.stringify(test.pages) !== JSON.stringify(required)) return "the level test's pages are not Day 7's required pages";
  }
  if (m.testWorkbook !== (test !== null)) return "the scan manifest's level test does not fit its kind of workbook";
  return null;
}

// ---------- Frozen at approval ----------

/** What the plan says about a book, stored once per run (RunFrame). */
export interface TeachingFrame {
  curriculum: string;
  curriculumVersion: string;
  plan: WorkbookPlan;
  /** Each skill's unit in that curriculum, for an item from a skill the planned part does not teach. */
  units: Readonly<Record<string, string>>;
}

/** The planned page of a printed page, by the day and page of its template content. */
function plannedPageOf(plan: WorkbookPlan, content: PageContent | undefined): PlannedPage | null {
  if (content?.kind !== "day") return null;
  // (An extra practice page is planned apart from its day. A plan that holds none has no context for it.)
  const pages = content.extraPractice ? plan.extraPractice ?? [] : plan.days.find((d) => d.day === content.day)?.pages ?? [];
  return pages.find((p) => p.number === content.page) ?? null;
}

interface TeachingQuestion {
  slot: string;
  part: string;
  place?: string;
  package: QuestionPackage;
  itemStep?: StepReference | null;
  stepDeclaration?: StepDeclaration;
  itemPlan?: { template?: { skill: string; step: number } };
}

/** The planned part a slot fills, from "<part>.<item>" on its planned page; null when it does not fit the plan. */
function plannedPart(page: PlannedPage | null, q: Pick<TeachingQuestion, "slot" | "part">): PlannedPart | null {
  const index = Number(q.slot.split(".")[0]) - 1;
  const part = Number.isInteger(index) ? page?.parts[index] : undefined;
  return part && part.kind === q.part ? part : null;
}

/**
 * A question's teaching context, resolved from the stored plan and the trusted package: null when the plan does not hold
 * its slot, so it is never rebuilt from a current profile or a heading. Try first never counts toward mastery, even when
 * scorable; an unscored or parent-checked item does not either (no curriculum or printed context permits one today).
 */
export function teachingContext(frame: TeachingFrame, page: { content?: PageContent; expected?: { slot: string; steps?: string[] }[] }, q: TeachingQuestion): TeachingContext | null {
  const planned = plannedPageOf(frame.plan, page.content);
  const part = plannedPart(planned, q);
  // (A package with neither an item nor an answer has not passed its check: the store refuses it.)
  if (!part || (!q.package.item && !q.package.answer)) return null;
  const item = packageItem(q.package);
  const plannedStep = part.step?.unit && part.step.skill ? { unit: part.step.unit, skill: part.step.skill, step: part.step.step } : null;
  const itemStep = testedStep(frame, q);
  const practiceType = q.place ?? null;
  const reason: MasteryReason | null = !item.scorable ? (item.parentChecked ? "parent-checked" : "not-scorable")
    : practiceType === "try-first" ? "try-first"
      : itemStep === null ? "no-item-step" : null;
  return {
    version: TEACHING_CONTEXT_VERSION, curriculum: { key: frame.curriculum, version: frame.curriculumVersion },
    practiceType, part: q.part, slot: q.slot, extra: !!part.extra, track: part.unit, plannedStep, itemStep,
    reviewSteps: page.expected?.find((e) => e.slot === q.slot)?.steps ?? [],
    eligibility: { format: item.format, scorable: item.scorable, parentChecked: item.parentChecked, mastery: reason === null, reason },
  };
}

/**
 * The step a question really tests, whole or not at all: its template's step (with that skill's own unit), when the
 * package names that skill; else a declaration from a step-specific builder. A planned step, a review list or an older
 * inferred itemStep never supplies a tested step.
 */
function testedStep(frame: TeachingFrame, q: TeachingQuestion): StepReference | null {
  const skills = q.package.skill.skills;
  const template = q.itemPlan?.template;
  if (template) {
    const unit = frame.units[template.skill];
    return unit && skills.includes(template.skill) ? { unit, skill: template.skill, step: template.step } : null;
  }
  const declared = q.stepDeclaration && ["template", "code", "warm-up"].includes(q.stepDeclaration.source)
    ? q.stepDeclaration.reference : null;
  if (declared) {
    return frame.units[declared.skill] === declared.unit && skills.includes(declared.skill)
      ? { ...declared } : null;
  }
  return null;
}

interface ManifestSource extends ManifestPage {
  day: number | null;
  pageOfDay: number | null;
  content?: PageContent;
  questions: readonly { slot: string; part: string }[];
}

/**
 * The required pages of each printed day and the level test's pages, from the stored plan and the printed pages: the
 * plan's every day and page must be printed, or there is no manifest. A page holding only an optional block is not
 * required. The test workbook's Day 7 must be the level test on every page; another workbook must have none.
 */
export function scanManifest(frame: TeachingFrame, pages: readonly ManifestSource[]): { manifest: ScanManifest; problem: null } | { manifest: null; problem: string } {
  const none = (problem: string) => ({ manifest: null, problem });
  const dayPages = pages.filter((p) => p.day !== null);
  const days: ScanManifest["days"] = [];
  for (const d of frame.plan.days) {
    const planned = d.pages.filter((p) => !p.extraPractice);
    const printed = dayPages.filter((p) => p.day === d.day);
    if (printed.length !== planned.length || !planned.every((x) => printed.some((p) => p.pageOfDay === x.number))) return none(`Day ${d.day}'s printed pages are not its planned pages`);
    const required = printed.filter((p) => {
      if (p.questions.length === 0) return false;
      const page = planned.find((x) => x.number === p.pageOfDay)!;
      return p.questions.some((q) => !plannedPart(page, q)?.extra);
    }).map((p) => p.number).sort((a, b) => a - b);
    if (required.length === 0) return none(`Day ${d.day} has no pages to scan`);
    days.push({ day: d.day, pages: required });
  }
  if (dayPages.some((p) => !frame.plan.days.some((d) => d.day === p.day))) return none("a printed day is not in the plan");
  const isLevelTest = (page: PlannedPage) => page.parts.some((p) => p.kind === "level-test");
  const testDays = frame.plan.days.filter((d) => d.pages.some(isLevelTest));
  let levelTest: ScanManifest["levelTest"] = null;
  if (frame.plan.testWorkbook) {
    const day = frame.plan.days.find((d) => d.day === SNAPSHOT_DAY);
    if (!day || testDays.length !== 1 || testDays[0].day !== SNAPSHOT_DAY || !day.pages.filter((p) => !p.extraPractice).every(isLevelTest)) return none("the test workbook's Day 7 is not its level test");
    levelTest = { day: SNAPSHOT_DAY, pages: days.find((d) => d.day === SNAPSHOT_DAY)!.pages };
  } else if (testDays.length > 0) return none("a workbook that is not a test workbook has a level test");
  const manifest: ScanManifest = {
    version: SCAN_MANIFEST_VERSION, curriculum: { key: frame.curriculum, version: frame.curriculumVersion },
    testWorkbook: frame.plan.testWorkbook, snapshotDay: SNAPSHOT_DAY, days, levelTest,
  };
  const problem = manifestProblem(manifest, pages);
  return problem ? none(problem) : { manifest, problem: null };
}

/** What a printed revision is made from. */
export interface RevisionSource {
  id: string;
  pdfPath: string | null;
  pdfSha256?: string | null;
  printManifest?: ScanManifest | null;
  pages: readonly {
    number: number;
    qrToken: string;
    printContract?: PagePrintContract | null;
    questions: readonly { number: number; package: { id: string }; box: unknown; regions?: PrintedRegion[] | null; teaching?: TeachingContext | null }[];
  }[];
}

/**
 * The book's printed revision: one identity of its exact PDF, page images, content, geometry and teaching plan, as one
 * unit. Null unless the book has all of them: a book with part of a contract has none.
 */
export function printedRevision(w: RevisionSource): string | null {
  if (!w.pdfPath || !isSha256(w.pdfSha256) || !w.printManifest) return null;
  if (w.pages.some((p) => !p.printContract)) return null;
  return fingerprint({
    version: PRINT_CONTRACT_VERSION, workbookId: w.id, pdf: { path: w.pdfPath, sha256: w.pdfSha256 }, manifest: w.printManifest,
    pages: [...w.pages].sort((a, b) => a.number - b.number).map((p) => ({
      number: p.number, qrToken: p.qrToken, contract: p.printContract,
      questions: [...p.questions].sort((a, b) => a.number - b.number).map((q) => ({ number: q.number, id: q.package.id, box: q.box, regions: q.regions ?? null, teaching: q.teaching ?? null })),
    })),
  });
}

export type PhotoContract =
  | { status: "available"; revision: string; contract: PagePrintContract }
  | { status: "unavailable"; reason: "no-contract" | "other-revision" };

/**
 * The contract a photo may be read against: its page's, and only when the photo was identified against the book's
 * printed revision. A legacy book or a photo of an older revision keeps its attachment, with no automatic marking.
 */
export function printContractForPhoto(
  book: { printedRevision: string | null }, page: { printContract: PagePrintContract | null }, photo: { printedRevision: string | null },
): PhotoContract {
  if (!book.printedRevision || !page.printContract) return { status: "unavailable", reason: "no-contract" };
  if (photo.printedRevision !== book.printedRevision) return { status: "unavailable", reason: "other-revision" };
  return { status: "available", revision: book.printedRevision, contract: page.printContract };
}
