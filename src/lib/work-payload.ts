// The whiteboard work that comes with an answer (#67), checked on the server before anything is stored.
// For the server: it uses Node's Buffer. It has no "server-only" import so that its tests can run, as
// src/lib/sign-in-link.ts. No network or database: the answer route passes what this returns to the test attempt
// module (src/lib/test-attempt.ts), which checks the core's rule for which questions need work (workProblem) and
// stores it. This checks size and format. The strokes (#186) are checked by the strokes module (src/lib/strokes.ts).
import { parseStrokes } from "@/lib/strokes";
import { WORK_IMAGE_MAX_BYTES, WORK_TEXT_MAX, type WorkPayload } from "@/lib/test-api";

/**
 * The work as the answer route passes it on: the drawing as PNG bytes (or none), the typed working (or ""), and the
 * strokes as checked JSON (or none, #186). `strokesDropped`: strokes came but were left out, and why, for the log.
 */
export type ParsedWork =
  | { ok: true; png: Buffer | null; text: string; strokes: string | null; strokesDropped?: "invalid" | "too_big" }
  | { ok: false; error: "invalid" | "work_too_big"; message: string };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** The longest base64 text a drawing at the size limit can take. Longer text is refused before it is decoded. */
const BASE64_MAX = Math.ceil(WORK_IMAGE_MAX_BYTES / 3) * 4;

const invalid = (message: string): ParsedWork => ({ ok: false, error: "invalid", message });

/**
 * Checks the `work` field of an answer (a WorkPayload), or nothing for an empty board. The drawing must be a PNG of
 * at most WORK_IMAGE_MAX_BYTES; the typed working at most WORK_TEXT_MAX characters. Strokes that cannot be stored are
 * left out and never refuse the answer: they are for admins only (#186).
 */
export function parseWork(raw: unknown): ParsedWork {
  if (raw === undefined || raw === null) return { ok: true, png: null, text: "", strokes: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return invalid("The work must be an object.");
  const { image, text, strokes } = raw as { [K in keyof WorkPayload]?: unknown };

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
  const checked = parseStrokes(strokes);
  return { ok: true, png, text: typed, strokes: checked.strokes, ...(checked.dropped ? { strokesDropped: checked.dropped } : {}) };
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

/**
 * Where the whiteboard strokes of one answer are stored (#186): in the same private bucket and folder as the drawing,
 * so a family deletion removes them too. Not a .png: the storage policy lets a parent read only the drawings, and an
 * admin read everything (migration add_answer_strokes).
 */
export const strokesPath = (parentId: string, assessmentId: string, questionId: string, suffix: string) =>
  `${parentId}/${assessmentId}/${questionId}-${suffix}.strokes.json`;
