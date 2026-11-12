// The photo check's words and timings that the browser needs (#855). No server code here: the check itself is
// src/lib/scan-photo-check.ts, which re-exports these.

/** The preview screen asks again this often while the check is pending, for at most PHOTO_CHECK_WAIT_MS. */
export const PHOTO_CHECK_POLL_MS = 1_000;
export const PHOTO_CHECK_WAIT_MS = 6_000;

export type PhotoProblem = "blurry" | "glare" | "shadow" | "faint";
/** The order in which the parent is told of a problem: only the first found is shown. */
export const PHOTO_PROBLEMS: readonly PhotoProblem[] = ["blurry", "glare", "shadow", "faint"];

/** The parent's sentence for each problem. */
export const PHOTO_PROBLEM_TEXT: Readonly<Record<PhotoProblem, string>> = {
  blurry: "The photo is blurry. Hold the phone still and take it again.",
  glare: "There is a bright light on the page. Move away from the light and take it again.",
  shadow: "A shadow covers some answers. Take it again in even light.",
  faint: "Some writing is hard to see. Take it again closer to the page.",
};

/** What the parent's preview gets: the state and, when done, the first problem. No probabilities, no token. */
export type PhotoCheckView = { state: "pending" } | { state: "done"; problem: PhotoProblem | null } | { state: "unknown" } | null;
