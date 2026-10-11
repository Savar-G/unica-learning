// The whiteboard work that comes with an answer (#67), checked on the server before anything is stored.
// Server only (Buffer). Pure: the answer route stores what this returns (src/lib/work-store.ts).
import { WORK_IMAGE_MAX_BYTES, WORK_TEXT_MAX } from "@/lib/test-api";

/** The work as the answer route stores it: the drawing as PNG bytes (or none), and the typed working (or ""). */
export type ParsedWork = { ok: true; png: Buffer | null; text: string } | { ok: false; error: "invalid" | "work_too_big"; message: string };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** The longest base64 text a drawing at the size limit can take. Longer text is refused before it is decoded. */
const BASE64_MAX = Math.ceil(WORK_IMAGE_MAX_BYTES / 3) * 4;

const invalid = (message: string): ParsedWork => ({ ok: false, error: "invalid", message });

/**
 * Checks the `work` field of an answer: `{ image?: base64 PNG, text?: string }`, or nothing for an empty board.
 * The drawing must be a PNG of at most WORK_IMAGE_MAX_BYTES; the typed working at most WORK_TEXT_MAX characters.
 */
export function parseWork(raw: unknown): ParsedWork {
  if (raw === undefined || raw === null) return { ok: true, png: null, text: "" };
  if (typeof raw !== "object" || Array.isArray(raw)) return invalid("The work must be an object.");
  const { image, text } = raw as { image?: unknown; text?: unknown };

  let png: Buffer | null = null;
  if (image !== undefined && image !== null) {
    if (typeof image !== "string" || image.length === 0) return invalid("The drawing must be a PNG image in base64.");
    if (image.length > BASE64_MAX) return tooBig("drawing");
    if (!BASE64.test(image)) return invalid("The drawing must be a PNG image in base64.");
    png = Buffer.from(image, "base64");
    if (png.length > WORK_IMAGE_MAX_BYTES) return tooBig("drawing");
    if (png.length < PNG_SIGNATURE.length || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      return invalid("The drawing must be a PNG image.");
    }
  }

  let typed = "";
  if (text !== undefined && text !== null) {
    if (typeof text !== "string") return invalid("The typed working must be text.");
    typed = text.trim();
    // Characters as the child sees them (an emoji is one), as Postgres counts them.
    if ([...typed].length > WORK_TEXT_MAX) return tooBig("text");
  }
  return { ok: true, png, text: typed };
}

function tooBig(what: "drawing" | "text"): ParsedWork {
  const message = what === "drawing"
    ? `The drawing is too big to save. The limit is ${WORK_IMAGE_MAX_BYTES / 1_000_000} MB.`
    : `The typed working is too long to save. The limit is ${WORK_TEXT_MAX} characters.`;
  return { ok: false, error: "work_too_big", message };
}

/**
 * Where a drawing is stored in the private bucket: the parent's folder first, so the storage rule can check the owner,
 * then the test, then the question. `suffix` is new for each upload, so two tabs never write over each other's file.
 */
export const workPath = (parentId: string, assessmentId: string, questionId: string, suffix: string) =>
  `${parentId}/${assessmentId}/${questionId}-${suffix}.png`;
