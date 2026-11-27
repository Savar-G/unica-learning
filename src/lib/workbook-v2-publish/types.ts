// The seams of the v2 book job (UNI-141, docs/workbook-v2-engine.md "Publishing"): the store of allocations and books, and
// the file store. Each has a memory adapter (memory-store.ts) and a Supabase adapter (supabase-store.ts), and both pass the
// tests of publish-store.test.ts. The engine (src/lib/workbook-v2) knows none of this.
import type { Json } from "@/lib/database.types";
import type { PagePrintContract, PrintedRegion, ScanManifest } from "@/lib/workbook-print-contract";
import type { QuestionBox } from "@/lib/workbook-content";
import type { QuestionPackage } from "@/lib/question-package";
import type { AnswerKind, AnswerPart, Step } from "@/lib/workbook-v2/contract";
import type { PlannedBookSheet } from "./full-book";

/** What a book is asked for: a key the caller keeps for retries, the child, the snapshot and the sheets in order. */
export interface PublishRequest {
  requestKey: string;
  childId: string;
  snapshot: unknown;
  sheets: PlannedBookSheet[];
  /**
   * The pages a day set for this book (product spec 7.2). Each day has half as many sheets, and the last day may have one
   * more so that the book has an even number of sheets. When absent, it is twice the sheets of day 1.
   */
  pagesPerDay?: number;
  /** The region pack and the interest of the word problems; the snapshot's defaults when absent. */
  region?: string;
  scenario?: string;
}

/** The book request of the engine, with the ids and QR texts that the allocation made. Plain JSON. */
export interface BookInputJson {
  bookId: string;
  childId: string;
  sheets: { sheetId: string; attempt: number; startsDay: boolean; qr: { front: string; back: string } }[];
  region?: string;
  scenario?: string;
}

/** What an allocation saves before the build, so that a retry builds the same book. */
export interface AllocationRecord {
  format: 1;
  snapshotId: string;
  snapshotHash: string;
  levels: number[];
  pagesPerDay: number;
  book: BookInputJson;
  /** The day of each sheet, in book order. */
  days: number[];
  /** The QR token of each page, in page order (the front, then the back of each sheet). */
  qrTokens: string[];
}

export interface AllocationCandidate {
  childId: string;
  workbookId: string;
  requestKey: string;
  inputHash: string;
  inputPath: string;
  /** ISO time. */
  allocatedAt: string;
  allocation: AllocationRecord;
}

export interface Allocation extends AllocationCandidate { parentId: string; workbookNumber: number }

export type AllocateResult = ({ status: "allocated" | "existing" } & Allocation) | { status: "refused"; reason: string };

/** A child's family for the job: a test family may get v2 books; any other family gets none. */
export type FamilyCheck = { status: "test"; parentId: string } | { status: "not-test" } | { status: "unknown-child" };

export interface PublishedRef { workbookId: string; printedRevision: string | null }

export type PublishResult = ({ status: "published" | "existing" } & PublishedRef) | { status: "refused"; reason: string };

export interface PayloadPage {
  number: number;
  dayLabel: string;
  type: "practice";
  image: { path: string; width: number; height: number };
  qrToken: string;
  printContract: PagePrintContract;
}

export interface PayloadQuestion { pageNumber: number; number: number; package: QuestionPackage; box: QuestionBox; regions: PrintedRegion[] }

export interface PayloadItemAnswer {
  pageNumber: number;
  itemId: string;
  questionNumber: number;
  snapshotId: string;
  sheetId: string;
  rowId: string;
  attempt: number;
  questionId: string | null;
  phrasingId: string | null;
  scenarioId: string | null;
  engineVersion: string;
  shape: string;
  shapeVersion: number;
  /** The numbers of the question, as the engine made them (BookItem.question). */
  params: Json;
  prompt: string;
  answerKind: AnswerKind;
  answerValue: string;
  acceptedForms: string[];
  unit: string | null;
  parts: AnswerPart[];
  workedSteps: Step[];
  difficulty: number;
  itemHash: string;
}

export interface PayloadSheet { sheetId: string; attempt: number; day: number; frontPageNumber: number; backPageNumber: number; snapshotId: string; startsDay: boolean }
export interface PayloadTimeLog { day: number; firstSheetId: string; pageNumber: number }

/** One whole book for publish_v2_workbook: every row, written in one transaction. */
export interface PublishPayload {
  schemaVersion: number;
  workbook: {
    id: string;
    childId: string;
    number: number;
    levels: number[];
    pdfPath: string;
    pdfSha256: string;
    printManifest: ScanManifest;
    printedRevision: string;
    bankSnapshotId: string;
    bankSnapshotHash: string;
    engineVersion: string;
    rendererVersion: string;
    fontHashes: Record<string, string>;
    inputHash: string;
    inputPath: string;
    pagesPerDay: number;
  };
  pages: PayloadPage[];
  questions: PayloadQuestion[];
  itemAnswers: PayloadItemAnswer[];
  sheets: PayloadSheet[];
  timeLogs: PayloadTimeLog[];
}

/** A stored v2 book's identity, for replay. */
export interface StoredV2Book {
  workbookId: string;
  inputHash: string;
  inputPath: string;
  engineVersion: string;
  rendererVersion: string;
  fontHashes: Record<string, string>;
  pdfSha256: string | null;
  pages: { number: number; imageSha256: string | null }[];
}

export interface V2PublishStore {
  family(childId: string): Promise<FamilyCheck>;
  /** Saves the candidate, or gives back the allocation that its request key or input hash already has. */
  allocate(candidate: AllocationCandidate): Promise<AllocateResult>;
  /** The published book with this input hash, or null. */
  findByInputHash(inputHash: string): Promise<PublishedRef | null>;
  /** Writes every row of the book, or nothing; the same input hash again writes nothing and gives back the book. */
  publish(payload: PublishPayload): Promise<PublishResult>;
  /** A v2 book's identity and fingerprints, or null. */
  storedBook(workbookId: string): Promise<StoredV2Book | null>;
}

export type V2FileType = "application/pdf" | "image/png" | "application/json";
export interface V2File { path: string; contentType: V2FileType; bytes: Uint8Array }

/** The workbook bucket. A path is named by the hash of its content, so a path that exists already holds the same bytes. */
export interface V2Storage {
  /** "existing" when the path is taken: that counts as stored. */
  put(file: V2File): Promise<"stored" | "existing">;
  get(path: string): Promise<Uint8Array | null>;
}

/** Which generator made a workbook (workbooks.generator). */
export const WORKBOOK_GENERATORS = ["v1", "v2"] as const;
export type WorkbookGenerator = (typeof WORKBOOK_GENERATORS)[number];
/** How far the time log of a day is read (workbook_time_logs.reading_state): not yet, read, left blank, or not readable. */
export const TIME_LOG_READING_STATES = ["pending", "read", "blank", "unclear"] as const;
export type TimeLogReadingState = (typeof TIME_LOG_READING_STATES)[number];
