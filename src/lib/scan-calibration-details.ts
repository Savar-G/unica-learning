import { SCAN_MARKS, type Box, type Point, type ScanMark } from "@/lib/workbook-print-contract";

/** Why we could not map this photo to its print.
 * Missing or inconsistent marks cannot place the page. Page mismatch, ambiguous page and unclear orientation
 * describe the print match. A QR mismatch means the expected code was missing, moved or replaced.
 * Corner-covered originally refused a page. The current crop job holds the affected answers instead.
 */
export type CalibrationRefusal = "marks-missing" | "marks-inconsistent" | "page-mismatch" | "ambiguous-page" | "orientation-unclear" | "qr-mismatch" | "corner-covered";

export interface CoveredRegionDetails {
  question: number;
  /** One-based index in the question's measured regions. */
  region: number;
  shown: number;
  examined: number;
  required: number;
}

export interface PageFitDetails {
  score: number;
  examined: number;
  visible: number;
}

export interface ScanCalibrationDetails {
  /** Candidate count is available even when no map can identify individual corners. */
  markCandidates?: number;
  /** Corner indices follow the print contract's TL, TR, BR, BL order. */
  marks?: { found: number[]; hidden: number[]; missing: number[] };
  /** 0: no code read, 1: another code, 2: this page's code. */
  qrRead: 0 | 1 | 2;
  /** 1: mark-based map, 2: QR-based map. Omitted before a map is attempted. */
  placement?: 1 | 2;
  qrCorners?: Point[];
  qrPatches?: number;
  /** The score is an upper bound when the comparison stopped before examining all visible cells. */
  pageFit?: PageFitDetails & { placement: 1 | 2 };
  covered?: CoveredRegionDetails[];
}

export function noteScanMarks(details: ScanCalibrationDetails, hidden: readonly ScanMark[], missing: readonly ScanMark[]) {
  const indices = (marks: readonly ScanMark[]) => marks.map(mark => SCAN_MARKS.indexOf(mark));
  details.marks = {
    found: indices(SCAN_MARKS.filter(mark => !hidden.includes(mark) && !missing.includes(mark))),
    hidden: indices(hidden),
    missing: indices(missing),
  };
}

export function noteScanCode(details: ScanCalibrationDetails, corners: readonly Point[], matches: boolean) {
  if (!matches && details.qrRead === 2) return;
  details.qrRead = matches ? 2 : 1;
  details.qrCorners = corners.map(({ x, y }) => ({ x: Math.round(x), y: Math.round(y) }));
}

export type AnswerPlacement = { box: Box; offset: Point } & (
  { issue?: "alignment" } | { issue: "covered"; ring: Pick<CoveredRegionDetails, "shown" | "examined" | "required"> }
);
