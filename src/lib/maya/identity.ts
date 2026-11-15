// #1051 (safety floor): code's own read of a child asking whether Maya is a person, an AI, a robot or human. When it
// fires on the child's turn, the session makes code's fixed disclosure line ("about.ai", lines.ts) due before any model
// call, so nothing streams before it and nothing replaces it. The model's reading (`aboutMaya`) stays a second way in.
//
// Fail closed: a sentence that asks Maya ("you", "Maya", "this") whether she is a person, human, robot, AI, computer,
// real or alive fires, with a few filler words between ("Are you even a real person?"); so do "who are you" and "what
// are you" as a whole sentence. Questions about something else ("Are you ready?", "Are you sure?", "Is this right?")
// do not, and nor does a word problem's person ("Is this the man with 52 apples?").

/** A word for what Maya might be, after an optional "real". */
const KIND =
  "(?:(?:real|actual|true|living|fake|pretend)\\s+)?(?:person|people|human(?:\\s+being)?|humans|robot|robo|bot|chat\\s*bot|ai|a\\s?\\.?\\s?i\\.?|artificial(?:\\s+intelligence)?|computer|machine|program|app|chat\\s*gpt|siri|alexa|android|cyborg)";
/** What a child asks of Maya herself ("Are you a girl?", "Are you a teacher?"), only after "are you". */
const SELF = `(?:${KIND}|(?:(?:real|actual)\\s+)?(?:lady|girl|woman|man|guy|boy|teacher|tutor|grown-?up|adult|kid))`;
/** Words that may stand between "are you" and the kind. */
const FILL = "(?:(?:really|actually|even|just|like|maybe|not|an?|the|one|of|those|some|kind|sort)\\s+){0,4}";
/** A state Maya might be in: real, alive. */
const STATE = "(?:real|alive|living|fake|pretend|human)";

const PATTERNS: readonly RegExp[] = [
  // "Are you a real person?", "Are you an AI?", "r u a robot", "Are you even a real teacher?"
  new RegExp(`\\b(?:are|r)\\s+(?:you|u|ya)\\s+${FILL}${SELF}\\b`, "i"),
  // "Are you real?", "Are you even alive?", "Are you not human?"
  new RegExp(`\\b(?:are|r)\\s+(?:you|u|ya)\\s+${FILL}${STATE}\\b`, "i"),
  // "Is Maya a computer?", "Is this a robot?", "Is this a real person?", "Is Maya real?"
  new RegExp(`\\bis\\s+(?:maya|this)\\s+(?:(?:really|actually|even|just|an?)\\s+){0,3}(?:${KIND}\\b|${STATE}\\s*(?:,?\\s*maya)?\\s*[?.!]*$)`, "i"),
  // "Am I talking to a robot?", "Am I chatting with a real person?"
  new RegExp(`\\b(?:am\\s+i|are\\s+we)\\s+(?:talking|speaking|chatting|texting|working)\\s+(?:to|with)\\s+(?:(?:a|an|the|real|actual|really)\\s+){0,3}${KIND}\\b`, "i"),
  // "Is there a real person there?", "Is there a human?"
  new RegExp(`\\bis\\s+there\\s+(?:(?:a|an|real|actual)\\s+){0,2}(?:person|human|people|teacher|grown-?up)\\b`, "i"),
  // "You're a robot?", "You are not real?", "Maya is an AI, right?" (asked as a question)
  new RegExp(`\\b(?:you'?re|you\\s+are|ur|maya\\s+is)\\s+${FILL}(?:${KIND}|${STATE})\\b[^.?!]*\\?`, "i"),
  // "Who are you?", "What are you?", "Who is this?" as a whole sentence.
  /^(?:(?:so|um+|hey|wait|but|and|ok(?:ay)?|maya)\s*,?\s+)?(?:who|what)\s+(?:are|r)\s+(?:you|u)(?:\s+(?:really|actually|exactly))?\s*[?.!]*$/i,
  /^(?:(?:so|um+|hey|wait|but|and|ok(?:ay)?)\s*,?\s+)?who(?:\s+is|'s)\s+(?:this|that|maya|talking)\s*[?.!]*$/i,
];

/**
 * Whether the child's own words ask whether Maya is a person, an AI, a robot or human. Read per sentence, with curly
 * apostrophes made plain. Code's read; the model's reading is never needed for it to fire.
 */
export function asksIdentity(text: string): boolean {
  if (typeof text !== "string") return false;
  const plain = text.replace(/[‘’ʼ]/g, "'").replace(/[ \t]+/g, " ").trim();
  if (!plain) return false;
  const sentences = plain.split(/(?<=[?!.])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  return sentences.some((x) => PATTERNS.some((p) => p.test(x)));
}
