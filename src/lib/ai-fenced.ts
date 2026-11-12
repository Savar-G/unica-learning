// The model outputs the AI client read from inside one Markdown code fence (first-ship practice at 6de7e777: 9 of 319
// Maya calls failed as bad_json once her request went out without `response_format`). A request that sent
// `response_format` never gets here: its output is read strictly. Kept apart from the OpenRouter adapter so the text
// session can count them in its trace without importing the adapter. No dependencies.

const fenced = new WeakSet<object>();

/** Notes that the client read this output from inside one code fence. Only an object can be noted (a proposal is one). */
export function noteFenced(value: unknown): void {
  if (typeof value === "object" && value !== null) fenced.add(value);
}

/** The client read this output from inside one code fence. */
export const readFromFence = (value: unknown): boolean => typeof value === "object" && value !== null && fenced.has(value);
