// Whether Maya's free talk is on for a kind of call (D-197). Free talk is the model's own words in a turn with no math
// line, said only after the code guards and the review pass (src/lib/maya-text.ts). It is on for the admin test calls
// and the local practice tools. For children's calls (the voice agent, #326, and any later kind) it follows one
// setting, MAYA_FREE_TALK: on unless it is "off". Savar turns it off there in one place: the Vercel variable.
// Pure: the environment is passed in.

/** The kinds of Maya call: admin test calls today; children's calls later. */
export type FreeTalkCallKind = "admin_test" | "child";

/** Free talk for a call of this kind now. */
export function freeTalkFor(kind: FreeTalkCallKind, env: Record<string, string | undefined> = process.env): boolean {
  if (kind === "admin_test") return true;
  return env.MAYA_FREE_TALK?.trim().toLowerCase() !== "off";
}
