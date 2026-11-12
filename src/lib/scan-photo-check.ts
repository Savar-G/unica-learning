// The photo check at upload (#855, spec #850 slice C): can the answers on a calibrated photo be read? One decision request
// over the straightened page asks closed questions about the answer areas. The first release asks `blurry` only; glare,
// shadow and faint wait for labelled real photos (slice B) and a threshold that meets the rule below.
// Code already refuses a wrong page, two sheets, and a page without its scan marks or QR code (src/lib/scan-calibration.ts);
// this check does not repeat them.
// Who: only a family in public.test_accounts or an admin (markedFamily), until the privacy disclosure names the provider
// (slice E). For any other family it does not run and stores nothing.
// Never blocks a parent: a problem shows "Take again" and "Send anyway". An error, a time-out, a price refusal or a safety
// block shows nothing and is stored as `unknown` (this caller's fail-closed means "do not block"). It is never a pass.
// State in scan_photos.photo_check: null (not eligible, never started), pending, done, unknown. The claim and the finish
// are database functions (claim_photo_check, finish_photo_check), so two calls never run one photo's check twice, and a
// late finish of a replaced claim changes nothing.
import sharp from "sharp";
import { DecisionError, type DecisionClient, type DecisionErrorKind, type DecisionQuestion } from "@/lib/decision-client";
import { PHOTO_PROBLEMS, type PhotoCheckView, type PhotoProblem } from "@/lib/scan-photo-check-text";

export { PHOTO_CHECK_POLL_MS, PHOTO_CHECK_WAIT_MS, PHOTO_PROBLEMS, PHOTO_PROBLEM_TEXT, type PhotoCheckView, type PhotoProblem } from "@/lib/scan-photo-check-text";

/** The thresholds' version. Raise it with any change to a threshold, a question or the image. A stored result keeps it. */
export const PHOTO_CHECK_VERSION = 1;
/** The one time limit of the decision request (the price check included). */
export const PHOTO_CHECK_TIMEOUT_MS = 3_000;
/** A pending claim older than this is taken as lost (its function stopped), and the next preview call may start again. */
export const PHOTO_CHECK_STALE_SECONDS = 60;
/**
 * The image limits of the decision models (Jev: each side 280 to 1,568 px; see src/lib/decision-marking-comparison.ts).
 * The page is scaled to fit inside the long side. A page that is then under the short side is not sent.
 */
export const PHOTO_IMAGE_MAX_SIDE = 1568;
export const PHOTO_IMAGE_MIN_SIDE = 280;

/** What the model reads before the image. No child data: only the task. */
export const PHOTO_CHECK_CONTEXT = "This is a photo of one printed workbook page, straightened. A child wrote answers by hand in the answer boxes. Look only at the answer boxes and the handwriting in them.";

export const PHOTO_CHECK_QUESTIONS: Readonly<Record<PhotoProblem, DecisionQuestion>> = {
  blurry: {
    type: "noul", instructions: "Is the handwriting in the answer boxes blurry?",
    yes: "The handwriting or the box lines are blurred or out of focus, so a teacher could not read the answers with confidence.",
    no: "The handwriting and the box lines are sharp enough to read. Empty boxes with sharp lines are not blurry.",
  },
  glare: { type: "noul", instructions: "Does a bright light or glare cover any answer box?" },
  shadow: { type: "noul", instructions: "Does a shadow cover any answer box?" },
  faint: { type: "noul", instructions: "Is the writing too faint to read?" },
};

/**
 * The thresholds of PHOTO_CHECK_VERSION: P(yes) at or above it is a problem. null: the question is not asked. Each is the
 * lowest value from 0.50 to 0.99 that flags none of the 30 clear synthetic photos; a question ships only when it also
 * flags at least 80% of its problem photos (docs/photo-check-thresholds.md).
 */
export const PHOTO_CHECK_THRESHOLDS: Readonly<Record<PhotoProblem, number | null>> = { blurry: 0.5, glare: null, shadow: null, faint: null };

/**
 * Why a check is unknown: a decision error kind, "image" (the page could not be read or sized), "missing" (no page), or
 * "ineligible" (the family stopped being a test family or an admin before the request; nothing was sent, and the
 * database does not store it for a family that is no longer eligible).
 */
export type PhotoCheckError = DecisionErrorKind | "image" | "missing" | "ineligible";

export type PhotoCheck =
  | { state: "pending"; token: string; at: string }
  | { state: "done"; version: number; model: string; probabilities: Partial<Record<PhotoProblem, number>>; problem: PhotoProblem | null; usd: number | null; ms: number; at: string }
  | { state: "unknown"; version: number; model: string; error: PhotoCheckError; ms: number; at: string };

/** The questions this version asks: those with a threshold. */
export function askedProblems(thresholds: Readonly<Record<PhotoProblem, number | null>> = PHOTO_CHECK_THRESHOLDS): PhotoProblem[] {
  return PHOTO_PROBLEMS.filter((p) => thresholds[p] !== null);
}

/** The first problem at or above its threshold, in PHOTO_PROBLEMS order, or null. */
export function firstProblem(probabilities: Partial<Record<PhotoProblem, number>>, thresholds: Readonly<Record<PhotoProblem, number | null>> = PHOTO_CHECK_THRESHOLDS): PhotoProblem | null {
  for (const p of PHOTO_PROBLEMS) {
    const t = thresholds[p], v = probabilities[p];
    if (t !== null && typeof v === "number" && v >= t) return p;
  }
  return null;
}

const probability = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;

/** A stored value read back, or null when it is not one of the states. */
export function readPhotoCheck(raw: unknown): PhotoCheck | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.state === "pending" && typeof r.token === "string" && typeof r.at === "string") return { state: "pending", token: r.token, at: r.at };
  if (typeof r.version !== "number" || typeof r.model !== "string" || typeof r.at !== "string") return null;
  const ms = typeof r.ms === "number" ? r.ms : 0;
  if (r.state === "unknown" && typeof r.error === "string") return { state: "unknown", version: r.version, model: r.model, error: r.error as PhotoCheckError, ms, at: r.at };
  if (r.state !== "done" || !r.probabilities || typeof r.probabilities !== "object") return null;
  const probabilities: Partial<Record<PhotoProblem, number>> = {};
  for (const p of PHOTO_PROBLEMS) {
    const v = (r.probabilities as Record<string, unknown>)[p];
    if (probability(v)) probabilities[p] = v;
  }
  const problem = PHOTO_PROBLEMS.includes(r.problem as PhotoProblem) ? r.problem as PhotoProblem : null;
  return { state: "done", version: r.version, model: r.model, probabilities, problem, usd: typeof r.usd === "number" ? r.usd : null, ms, at: r.at };
}

/** The parent's view of a stored value. */
export function photoCheckView(raw: unknown): PhotoCheckView {
  const check = readPhotoCheck(raw);
  if (!check) return null;
  if (check.state === "done") return { state: "done", problem: check.problem };
  return { state: check.state };
}

/** The page scaled to fit the model's image limits, as JPEG. Throws when it cannot be read or is too small. */
export async function photoCheckImage(bytes: Uint8Array): Promise<Uint8Array> {
  const image = sharp(bytes, { limitInputPixels: 48_000_000, failOn: "warning" });
  const meta = await image.metadata();
  if (!meta.width || !meta.height) throw new Error("photo check: no size");
  const scale = Math.min(1, PHOTO_IMAGE_MAX_SIDE / Math.max(meta.width, meta.height));
  const width = Math.round(meta.width * scale), height = Math.round(meta.height * scale);
  if (Math.min(width, height) < PHOTO_IMAGE_MIN_SIDE) throw new Error("photo check: too small");
  return new Uint8Array(await image.resize(width, height, { fit: "fill" }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer());
}

export interface PhotoRef { parent: string; photo: string }

export interface PhotoCheckStore {
  /** A family in public.test_accounts, or an admin. A failed read is not eligible. */
  eligible(parent: string): Promise<boolean>;
  /**
   * Writes {"state":"pending"} with this token when the family is a test family or an admin (checked in the same
   * transaction), and the photo has no check, or only a pending one older than PHOTO_CHECK_STALE_SECONDS, and is saved
   * and not sent. False: nothing written.
   */
  claim(o: PhotoRef & { token: string }): Promise<boolean>;
  /** The straightened page's bytes, or null when there is none. */
  straight(o: PhotoRef): Promise<Uint8Array | null>;
  /**
   * Stores the result only while this token's claim is the pending one and the family is still a test family or an
   * admin. For a family that is no longer eligible it stores nothing and removes the pending claim. False: nothing stored.
   */
  finish(o: PhotoRef & { token: string; result: Exclude<PhotoCheck, { state: "pending" }> }): Promise<boolean>;
}

/** Whether the check is on: a client, and at least one question with a threshold. */
export function photoCheckOn(client: DecisionClient | null, thresholds: Readonly<Record<PhotoProblem, number | null>> = PHOTO_CHECK_THRESHOLDS): client is DecisionClient {
  return client !== null && askedProblems(thresholds).length > 0;
}

/**
 * Claims the photo's check for this token: on, eligible, and no check yet. Fast (two reads and one write), so the preview
 * answers with "pending" at once; the check itself runs after the answer (runPhotoCheck).
 */
export async function claimPhotoCheck(store: PhotoCheckStore, ref: PhotoRef, o: { client: DecisionClient | null; token: string; thresholds?: Readonly<Record<PhotoProblem, number | null>> }): Promise<boolean> {
  if (!photoCheckOn(o.client, o.thresholds)) return false;
  if (!await store.eligible(ref.parent)) return false;
  return store.claim({ ...ref, token: o.token });
}

/**
 * Runs one claimed check and stores its result. Never throws for a check failure: an error, a time-out, a price refusal,
 * a safety block, or a page that cannot be read is stored as `unknown` and logged (no image, no child data in the log).
 */
export async function runPhotoCheck(store: PhotoCheckStore, ref: PhotoRef, o: {
  client: DecisionClient; token: string; thresholds?: Readonly<Record<PhotoProblem, number | null>>; timeoutMs?: number;
  now?: () => number; log?: (line: string) => void;
}): Promise<Exclude<PhotoCheck, { state: "pending" }>> {
  const thresholds = o.thresholds ?? PHOTO_CHECK_THRESHOLDS;
  const now = o.now ?? Date.now, log = o.log ?? ((line: string) => console.warn(line));
  const started = now();
  const base = { version: PHOTO_CHECK_VERSION, model: o.client.model };
  const unknown = (error: PhotoCheckError): Exclude<PhotoCheck, { state: "pending" }> => ({ state: "unknown", ...base, error, ms: now() - started, at: new Date(now()).toISOString() });
  const check = async (): Promise<Exclude<PhotoCheck, { state: "pending" }>> => {
    let bytes: Uint8Array | null;
    try { bytes = await store.straight(ref); } catch { return unknown("unavailable"); }
    if (!bytes) return unknown("missing");
    let image: Uint8Array;
    try { image = await photoCheckImage(bytes); } catch { return unknown("image"); }
    const asked = askedProblems(thresholds);
    // One time limit for the price check and the request.
    const signal = AbortSignal.timeout(o.timeoutMs ?? PHOTO_CHECK_TIMEOUT_MS);
    try {
      // The family can stop being a test family or an admin while the page and the price are read. The membership is
      // asked again inside the client (beforeSend), after every price wait and right before the photo is sent; the
      // early read here only saves a price wait for a family that is already out. A failed read is not eligible.
      const member = () => store.eligible(ref.parent).catch(() => false);
      await o.client.ready?.(signal);
      if (!await member()) return unknown("ineligible");
      const answer = await o.client.decide({
        input: [{ type: "text", text: PHOTO_CHECK_CONTEXT }, { type: "image", mediaType: "image/jpeg", data: image }],
        questions: Object.fromEntries(asked.map((p) => [p, PHOTO_CHECK_QUESTIONS[p]])),
        signal,
        beforeSend: member,
      });
      const probabilities: Partial<Record<PhotoProblem, number>> = {};
      for (const p of asked) {
        const a = answer.answers[p];
        if (a?.type !== "noul") return unknown("malformed");
        probabilities[p] = a.yes;
      }
      return { state: "done", ...base, probabilities, problem: firstProblem(probabilities, thresholds), usd: answer.usd, ms: now() - started, at: new Date(now()).toISOString() };
    } catch (e) {
      // "cancelled" is only the membership check in beforeSend: nothing was sent.
      return unknown(e instanceof DecisionError ? (e.kind === "cancelled" ? "ineligible" : e.kind) : "unavailable");
    }
  };
  const result = await check();
  if (result.state === "unknown") log(`photo check unknown: ${result.error} (photo ${ref.photo}, ${result.ms} ms)`);
  await store.finish({ ...ref, token: o.token, result });
  return result;
}

/** One labelled photo's P(yes) for one question: `problem` true for a photo of that problem kind, false for a clear one. */
export interface ThresholdRow { photo: string; problem: boolean; yes: number | null }

/** Candidate thresholds: 0.50 to 0.99 in steps of 0.01. */
export const PHOTO_THRESHOLD_GRID = Array.from({ length: 50 }, (_, n) => (50 + n) / 100);
/** A question ships only when its threshold flags at least this share of its problem photos. */
export const PHOTO_CHECK_CATCH_RATE = 0.8;

/**
 * The threshold rule (spec #850 slice C): the lowest grid value that flags none of the clear photos, and how many problem
 * photos it flags. A failed request (`yes` null) on a clear photo flags nothing; on a problem photo it is not caught. The
 * question passes when it catches at least PHOTO_CHECK_CATCH_RATE of its problem photos.
 */
export function chooseThreshold(rows: readonly ThresholdRow[]) {
  const clear = rows.filter((r) => !r.problem), problem = rows.filter((r) => r.problem);
  const flags = (t: number, r: ThresholdRow) => r.yes !== null && r.yes >= t;
  const threshold = PHOTO_THRESHOLD_GRID.find((t) => !clear.some((r) => flags(t, r))) ?? null;
  const caught = threshold === null ? 0 : problem.filter((r) => flags(threshold, r)).length;
  const failed = rows.filter((r) => r.yes === null).length;
  return {
    threshold, caught, problems: problem.length, clear: clear.length, failed,
    maxClear: Math.max(-1, ...clear.flatMap((r) => (r.yes === null ? [] : [r.yes]))),
    passes: threshold !== null && problem.length > 0 && caught / problem.length >= PHOTO_CHECK_CATCH_RATE,
  };
}
