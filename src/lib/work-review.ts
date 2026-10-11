// The AI step of the report job (#68, D-084): the AI reads each piece of the child's shown work, and writes the report
// text from the report model. Behind a switch: on only when ANTHROPIC_API_KEY is set (decision 2026-10-10 on #68, no key
// yet). Off, nothing here calls the AI, and the report has no AI comments and no AI text.
// For the server only: the background job (src/lib/report-job.ts) runs it before the report email. It has no
// "server-only" import so that its tests can run, as src/lib/sign-in-link.ts. The live site uses only an Anthropic API
// key, never a Claude subscription or `claude -p`.
// The rules for what a parent sees are in the assessment core (workReview, checkReportText): a comment shows only when
// the review is sure; report text with a number that is not in the model is rejected. The AI never changes a mark.
import {
  REVIEW_ERROR_TYPE_MAX,
  checkReportText,
  workReview,
  type Level,
  type ReportModel,
  type ReportTextProblem,
  type ReviewResult,
  type WorkReview,
} from "@/lib/assessment";
import { claudeReviewer } from "@/lib/work-review-claude";
import { fakeReviewer } from "@/lib/work-review-fake";

/** The model when AI_REVIEW_MODEL is not set: vision, structured output, and the cost the ticket assumed. */
export const AI_REVIEW_DEFAULT_MODEL = "claude-sonnet-5-5";
/** Pieces of work reviewed per test at most: show-your-work questions first, then optional work, in test order. */
export const REVIEW_MAX = 20;
/** Reviews that run at the same time. */
export const REVIEW_CONCURRENCY = 4;
/** The work reviews stop after this long; a review not done by then is left out (the work shows without a comment). */
export const REVIEW_STAGE_MS = 120_000;
/** The report text stops after this long; then the report has only its plain sentences. */
export const TEXT_STAGE_MS = 45_000;
/** work_reviews.comment holds at most this many characters. */
const STORED_COMMENT_MAX = 2000;

/** One piece of shown work, as the job finds it in the stored test and answers. */
export interface ReviewPiece {
  questionId: string;
  /** The question as the child saw it. */
  prompt: string;
  /** The child's answer, as stored. */
  answer: string;
  /** The right answer, from the stored test. */
  rightAnswer: string;
  /** The mark: the AI never changes it. */
  correct: boolean;
  /** The question's level for this child, 0 (kindergarten) to 8. */
  level: Level;
  /** True on a show-your-work question. */
  required: boolean;
  /** In plain words, the known mistake that the child's wrong answer matches; null when it matches none. */
  misconception: string | null;
  /** The drawing's path in the private bucket, or null when the child only typed. */
  image: string | null;
  /** The typed working, or null when the child only drew. */
  text: string | null;
}

/**
 * One piece as the reviewer gets it: the question, the answers, the mark and the work. No name, no account or question
 * ids. This is all the AI provider receives about the work (the privacy page lists it, #78).
 */
export type ReviewInput = Omit<ReviewPiece, "questionId" | "required" | "image"> & {
  /** The drawing as PNG bytes, or null when there is none. */
  png: Uint8Array | null;
};

/** The work reviewer (spec #54): the real one calls Claude through the Anthropic API; tests and dev use the fake. */
export interface WorkReviewer {
  /** The model id, stored with each review ("fake" for the fake). */
  readonly model: string;
  /** Reviews one piece of shown work. Throws when there is no usable review. */
  review(input: ReviewInput, signal: AbortSignal): Promise<ReviewResult>;
  /** Writes the report text from the report model, with REPORT_TEXT_NAME for the child. Throws when there is none. */
  reportText(model: ReportModel, signal: AbortSignal): Promise<string>;
}

/** A stored review (table work_reviews): the review the report uses, the reviewer's own score, and its model. */
export interface StoredReview extends WorkReview {
  score: number;
  model: string;
}

/** Where reviews and drawings live (Supabase in the job, memory in tests). */
export interface ReviewStore {
  /** Reviews stored for this test by an earlier run. */
  stored(): Promise<StoredReview[]>;
  /** Stores new reviews; one already stored for the question stays. */
  save(reviews: StoredReview[]): Promise<void>;
  /** The drawing's PNG bytes, or null when it cannot be read. */
  image(path: string): Promise<Uint8Array | null>;
}

/** What the AI step did, for Savar's alert. */
export type AiOutcome =
  | { on: false }
  | {
      on: true;
      model: string;
      /** Pieces of shown work in the test. */
      pieces: number;
      /** Reviewed, now or by an earlier run. */
      reviewed: number;
      /** Reviews sure enough for their comment to show. */
      sure: number;
      /** Reviews that failed or were not done in time. */
      failed: number;
      /** Pieces over REVIEW_MAX, not reviewed. */
      skipped: number;
      /** False when the new reviews could not be stored. */
      saved: boolean;
      text: { kept: true } | { kept: false; problem: ReportTextProblem | "failed"; detail: string };
    };

/**
 * The reviewer, or null when the AI is off. On only when ANTHROPIC_API_KEY is set; the model comes from AI_REVIEW_MODEL.
 * In development (never in a production build), AI_REVIEW_FAKE=sure or unsure gives the fake, for a report with
 * comments without a key.
 */
export function aiReviewer(env: Record<string, string | undefined> = process.env): WorkReviewer | null {
  const fake = env.AI_REVIEW_FAKE;
  if (env.NODE_ENV !== "production" && (fake === "sure" || fake === "unsure")) return fakeReviewer({ mode: fake });
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return claudeReviewer({ apiKey, model: env.AI_REVIEW_MODEL?.trim() || AI_REVIEW_DEFAULT_MODEL });
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A promise that rejects when the signal aborts. Handled, so an abort with no one waiting is not an unhandled rejection. */
function aborted(signal: AbortSignal): Promise<never> {
  const p = new Promise<never>((_, reject) => {
    if (signal.aborted) reject(new Error("time is up"));
    else signal.addEventListener("abort", () => reject(new Error("time is up")), { once: true });
  });
  p.catch(() => {});
  return p;
}

/** Reviews the pieces, a few at a time, until all are done or the time is up. Returns the reviews that finished. */
async function reviewAll(pieces: ReviewPiece[], reviewer: WorkReviewer, store: ReviewStore, ms: number): Promise<StoredReview[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const stop = aborted(controller.signal);
  const done: StoredReview[] = [];
  let next = 0;
  const one = async (piece: ReviewPiece) => {
    const png = piece.image ? await store.image(piece.image) : null;
    if (!png && !piece.text) throw new Error("the drawing could not be read");
    const { prompt, answer, rightAnswer, correct, level, misconception, text } = piece;
    const result = await reviewer.review({ prompt, answer, rightAnswer, correct, level, misconception, text, png }, controller.signal);
    const review = workReview(piece.questionId, piece.correct, result);
    // The table's limits: a score outside 0 to 1 or a very long comment is already "low" (workReview); store it in range.
    const score = Number.isFinite(result.score) ? Math.round(Math.min(1, Math.max(0, result.score)) * 1000) / 1000 : 0;
    return { ...review, comment: review.comment.slice(0, STORED_COMMENT_MAX), score, model: reviewer.model.slice(0, 80) };
  };
  const worker = async () => {
    while (next < pieces.length && !controller.signal.aborted) {
      const piece = pieces[next++];
      try {
        done.push(await Promise.race([one(piece), stop]));
      } catch (e) {
        console.error("[ai] review failed", piece.questionId, message(e));
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(REVIEW_CONCURRENCY, pieces.length) }, worker));
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return done;
}

/** The report text, or the reason there is none. */
async function writeText(model: ReportModel, reviewer: WorkReviewer, ms: number): Promise<{ text: string } | { error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return { text: await Promise.race([reviewer.reportText(model, controller.signal), aborted(controller.signal)]) };
  } catch (e) {
    console.error("[ai] report text failed", message(e));
    return { error: message(e).slice(0, 200) };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/**
 * The AI step of the report job. Off (no reviewer): no AI call, the work is not loaded, nothing is stored, and the model
 * has no AI parts. On: reviews the shown work (reusing reviews an earlier run stored), stores the new reviews, builds the
 * model with them, asks for the report text and keeps it only when it passes checkReportText. Never throws for the AI:
 * a review or text that fails or times out is left out, and the report still builds.
 */
export async function aiReport({
  reviewer,
  pieces: loadPieces,
  store,
  build,
  reviewMs = REVIEW_STAGE_MS,
  textMs = TEXT_STAGE_MS,
}: {
  reviewer: WorkReviewer | null;
  /** The pieces of shown work. Called only when the AI is on. */
  pieces: () => Promise<ReviewPiece[]>;
  store: ReviewStore;
  /** The report model from the reviews and the report text (reportModel with the job's context). */
  build: (workReviews: WorkReview[], reportText: string | null) => ReportModel;
  reviewMs?: number;
  textMs?: number;
}): Promise<{ model: ReportModel; ai: AiOutcome }> {
  if (!reviewer) return { model: build([], null), ai: { on: false } };

  const pieces = await loadPieces();
  const stored = await store.stored();
  const have = new Set(stored.map((r) => r.questionId));
  // Show-your-work questions first (the report picks them first), then optional work; each in test order.
  const ordered = [...pieces.filter((p) => p.required), ...pieces.filter((p) => !p.required)];
  const todo = ordered.slice(0, REVIEW_MAX).filter((p) => !have.has(p.questionId));
  const fresh = todo.length > 0 ? await reviewAll(todo, reviewer, store, reviewMs) : [];
  let saved = true;
  if (fresh.length > 0) {
    try {
      await store.save(fresh);
    } catch (e) {
      saved = false;
      console.error("[ai] storing reviews failed", message(e));
    }
  }
  const reviews: WorkReview[] = [...stored, ...fresh].map(({ questionId, errorType, kind, comment, confidence }) => ({ questionId, errorType: errorType.slice(0, REVIEW_ERROR_TYPE_MAX), kind, comment, confidence }));

  const plain = build(reviews, null);
  const written = await writeText(plain, reviewer, textMs);
  const check = "text" in written ? checkReportText(plain, written.text) : null;
  const model = "text" in written && check?.ok ? build(reviews, written.text) : plain;
  return {
    model,
    ai: {
      on: true,
      model: reviewer.model,
      pieces: pieces.length,
      reviewed: reviews.length,
      sure: reviews.filter((r) => r.confidence === "high").length,
      failed: todo.length - fresh.length,
      skipped: Math.max(0, ordered.length - REVIEW_MAX),
      saved,
      text: check?.ok ? { kept: true } : check ? { kept: false, problem: check.problem, detail: check.detail } : { kept: false, problem: "failed", detail: "error" in written ? written.error : "" },
    },
  };
}
