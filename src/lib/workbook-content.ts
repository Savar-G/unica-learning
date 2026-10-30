// Workbook content (#299, spec #295): the content part of the learning record. Every workbook, page and question is
// data: a workbook belongs to one child; a page has a number that runs through the whole workbook, a type, a rendered
// image and a QR token; a question has a number that restarts on each page, its question package (#298,
// src/lib/question-package.ts) and its box on the page image. A whole workbook is written as one unit, and a question
// is read by workbook, page number and question number in the same shape (QuestionLookup) as an assessment question.
//
// The store seam (WorkbookStore) has two adapters that pass the same tests: Supabase (src/lib/workbook-store.ts; the
// secret key writes, a parent's session reads only that family's workbooks) and in memory
// (src/lib/workbook-store-memory.ts). This file holds the shapes and the checks both adapters share.
// Pure TypeScript: no Next.js, React, network, database or clock.
import {
  checkQuestionPackage,
  type QuestionLookup,
  type QuestionPackage,
  type WorkbookQuestionRef,
} from "@/lib/question-package";

/**
 * The private Storage bucket for page images and workbook PDFs. A file is `<parent id>/<workbook id>/<name>`, so a
 * family deletion removes it with the family's folder.
 */
export const WORKBOOK_FILES_BUCKET = "workbook-pages";

export type WorkbookStatus = "draft" | "approved" | "printed" | "shipped";

/** A file in the workbook bucket: a rendered page (PNG) with its size in pixels. */
export interface PageImage {
  path: string;
  width: number;
  height: number;
}

/** Where a question is on its page image, in whole pixels from the top left corner. */
export interface QuestionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QuestionInput {
  /** From 1; restarts on each page. */
  number: number;
  box: QuestionBox;
  /** Its ref must name this workbook, page and question. */
  package: QuestionPackage;
}

export interface PageInput {
  /** From 1; runs through the whole workbook. */
  number: number;
  /** "Monday", "Day 3", or null. */
  dayLabel: string | null;
  /** The kind of page: "practice", "review", "cover". */
  type: string;
  /** The rendered page; a page with questions needs one, for the question boxes. */
  image: PageImage | null;
  /** The token in the page's QR code: it names this workbook and page. Unique across all workbooks. */
  qrToken: string;
  questions: QuestionInput[];
}

/** A whole workbook to write. It starts as a draft. */
export interface WorkbookInput {
  /** The workbook's id (a UUID), made by the caller, as each question package names it. */
  id: string;
  childId: string;
  /** The workbook's place in the child's sequence, from 1. */
  number: number;
  /** The levels the workbook covers, 1 to 30 (U1 to U30). */
  levels: number[];
  /** The printable PDF in the workbook bucket, or null. */
  pdfPath: string | null;
  /** The learner profile build the workbook was made from, or null. */
  profileBuild: string | null;
  pages: PageInput[];
}

export type WorkbookWrite = { status: "written"; workbookId: string } | { status: "refused"; reason: string };

/** A stored question: its package, or "content unavailable" when the stored package cannot be trusted. */
export interface WorkbookQuestion {
  number: number;
  box: QuestionBox;
  content: Exclude<QuestionLookup, { status: "not-found" }>;
}

export interface WorkbookPage {
  number: number;
  dayLabel: string | null;
  type: string;
  image: PageImage | null;
  qrToken: string;
  questions: WorkbookQuestion[];
}

export interface WorkbookSummary {
  id: string;
  parentId: string;
  childId: string;
  number: number;
  levels: number[];
  status: WorkbookStatus;
  pdfPath: string | null;
  profileBuild: string | null;
  createdAt: string;
  approvedAt: string | null;
  printedAt: string | null;
  shippedAt: string | null;
}

export interface Workbook extends WorkbookSummary {
  pages: WorkbookPage[];
}

export interface WorkbookStore {
  /** Writes a whole workbook as one unit: every page and question, or nothing. */
  write(workbook: WorkbookInput): Promise<WorkbookWrite>;
  /** A workbook with its pages and questions, in page and question order, or null. */
  workbook(id: string): Promise<Workbook | null>;
  /** A child's workbooks, newest (highest number) first. */
  childWorkbooks(childId: string): Promise<WorkbookSummary[]>;
  /** One page with its questions, or null. */
  page(workbookId: string, pageNumber: number): Promise<WorkbookPage | null>;
  /** A question by workbook, page number and question number. */
  question(ref: WorkbookQuestionRef): Promise<QuestionLookup>;
  /** The page whose QR code holds `token` (its number), with its workbook, or null. */
  pageByToken(token: string): Promise<{ workbook: WorkbookSummary; page: number } | null>;
}

// ---------- Checks both adapters share ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A QR token: 16 to 64 URL-safe characters, so it fits a short QR link. */
const QR_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
/** A file name in the workbook's folder: no folders below it. */
const FILE_NAME = /^[A-Za-z0-9._-]{1,100}$/;

/** The most questions a workbook may have. */
const MAX_QUESTIONS = 1000;

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
/** True when `v` has the shape of a page's QR token. */
export const isQrToken = (v: unknown): v is string => typeof v === "string" && QR_TOKEN.test(v);
const isWhole = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.trim() !== "" && v.length <= max;

/** A file's path: `<parent>/<workbook>/<name>`, and the workbook is this one. The store checks the parent. */
function pathProblem(path: unknown, workbookId: string): string | null {
  if (typeof path !== "string" || path.length > 200) return "a file path is not text of up to 200 characters";
  const [parent, workbook, name, ...rest] = path.split("/");
  if (!isUuid(parent) || workbook !== workbookId || !FILE_NAME.test(name ?? "") || rest.length > 0 || name === "." || name === "..") {
    return "a file is not in the workbook's folder";
  }
  return null;
}

const boxInside = (b: QuestionBox, image: PageImage) =>
  [b.x, b.y].every((n) => isWhole(n, 0)) && [b.width, b.height].every((n) => isWhole(n, 1)) && b.x + b.width <= image.width && b.y + b.height <= image.height;

/** What is wrong with a workbook to write, or null. The store checks the child, the family folder and conflicts. */
export function workbookProblem(w: WorkbookInput): string | null {
  if (!isUuid(w.id)) return "the workbook id is not a UUID";
  if (!isUuid(w.childId)) return "the child id is not a UUID";
  if (!isWhole(w.number, 1, 1000)) return "the workbook number is not from 1 to 1000";
  if (!Array.isArray(w.levels) || w.levels.length === 0 || !w.levels.every((l) => isWhole(l, 1, 30)) || new Set(w.levels).size !== w.levels.length) {
    return "the levels are not a list of different levels from U1 to U30";
  }
  if (w.pdfPath !== null) {
    const problem = pathProblem(w.pdfPath, w.id);
    if (problem) return problem;
  }
  if (w.profileBuild !== null && !isText(w.profileBuild, 100)) return "the profile build is not text of up to 100 characters";
  if (!Array.isArray(w.pages) || w.pages.length === 0) return "the workbook has no pages";
  if (w.pages.length > 500) return "the workbook has more than 500 pages";
  // The store reads a workbook's questions in one request, and PostgREST stops a response at 1000 rows.
  if (w.pages.reduce((n, p) => n + (Array.isArray(p.questions) ? p.questions.length : 0), 0) > MAX_QUESTIONS) {
    return `the workbook has more than ${MAX_QUESTIONS} questions`;
  }

  const pageNumbers = new Set<number>();
  const tokens = new Set<string>();
  const keys = new Set<string>();
  for (const p of w.pages) {
    if (!isWhole(p.number, 1, 1000)) return "a page number is not from 1 to 1000";
    if (pageNumbers.has(p.number)) return `page number ${p.number} is used twice`;
    pageNumbers.add(p.number);
    const at = `page ${p.number}`;
    if (!isText(p.type, 40)) return `${at}: the page type is not text of up to 40 characters`;
    if (p.dayLabel !== null && !isText(p.dayLabel, 40)) return `${at}: the day label is not text of up to 40 characters`;
    if (typeof p.qrToken !== "string" || !QR_TOKEN.test(p.qrToken)) return `${at}: the QR token is not 16 to 64 letters, digits, - or _`;
    if (tokens.has(p.qrToken)) return "a QR token is used twice";
    tokens.add(p.qrToken);
    if (p.image !== null) {
      const problem = pathProblem(p.image.path, w.id);
      if (problem) return problem;
      if (!isWhole(p.image.width, 1, 10000) || !isWhole(p.image.height, 1, 10000)) return `${at}: the image size is not 1 to 10000 pixels`;
    }
    if (!Array.isArray(p.questions)) return `${at}: the questions are not a list`;
    if (p.questions.length > 0 && p.image === null) return `${at} has questions but no image`;

    const questionNumbers = new Set<number>();
    for (const q of p.questions) {
      if (!isWhole(q.number, 1, 1000)) return `${at}: a question number is not from 1 to 1000`;
      if (questionNumbers.has(q.number)) return `question number ${q.number} is used twice on ${at}`;
      questionNumbers.add(q.number);
      const where = `${at}, question ${q.number}`;
      if (!q.box || !boxInside(q.box, p.image!)) return `${where}: the box is not inside the page image`;
      const check = checkQuestionPackage(q.package);
      if (!check.ok) return `${where}: ${check.reason}`;
      const ref = check.package.ref;
      if (ref.source !== "workbook" || ref.workbookId !== w.id || ref.page !== p.number || ref.question !== q.number) {
        return `${where}: the package ${refText(ref, w.id)}`;
      }
      if (check.package.id.length > 200) return `${where}: the package id is longer than 200 characters`;
      if (keys.has(check.package.id)) return `a question id is used twice (${check.package.id})`;
      keys.add(check.package.id);
    }
  }
  return null;
}

/** Where a package says it is, against the workbook it is in: "names page 3, question 1". */
function refText(ref: QuestionPackage["ref"], workbookId: string): string {
  if (ref.source !== "workbook") return "names an assessment question";
  return ref.workbookId === workbookId ? `names page ${ref.page}, question ${ref.question}` : "names another workbook";
}

/** A stored question as the database (or the memory store) keeps it. */
export interface StoredQuestion {
  number: number;
  box: QuestionBox;
  schemaVersion: number;
  package: unknown;
}

/**
 * A stored question's content: its package when it passes the check of its stored version and names the place it was
 * read from; else "content unavailable". A product never teaches or marks from an unavailable question.
 */
export function storedContent(stored: StoredQuestion, at: WorkbookQuestionRef): WorkbookQuestion["content"] {
  const unavailable = (detail: string) => ({ status: "unavailable" as const, reason: "invalid-package" as const, detail });
  const check = checkQuestionPackage(stored.package, stored.schemaVersion);
  if (!check.ok) return unavailable(check.reason);
  const ref = check.package.ref;
  if (ref.source !== "workbook" || ref.workbookId !== at.workbookId || ref.page !== at.page || ref.question !== at.question) {
    return unavailable(`the stored package ${refText(ref, at.workbookId)}`);
  }
  return { status: "found", package: check.package };
}

/** A question read from its stored form. */
export function storedQuestion(stored: StoredQuestion, at: WorkbookQuestionRef): WorkbookQuestion {
  return { number: stored.number, box: stored.box, content: storedContent(stored, at) };
}
