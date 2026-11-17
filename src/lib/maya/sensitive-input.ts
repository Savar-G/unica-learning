const IMMEDIATE = /^(?:i(?:'m| am) (?:in (?:immediate )?danger|not safe (?:right )?now)|i (?:want|plan|intend) to (?:hurt|kill) myself|i(?:'m| am) (?:about|going) to (?:(?:hurt|kill) (?:myself|him|her|them|someone|somebody)|end my life|jump (?:off|from) (?:the |a )?(?:roof|bridge|building))|i(?:'m| am) being (?:hurt|hit|attacked|threatened) (?:right )?now)\b/;
const CONCERN = /^(?:i (?:do not|don't) feel safe|i(?:'m| am| feel) (?:not safe|unsafe)|i(?:'m| am) being (?:hurt|hit|bullied|abused|threatened)|i (?:hurt|cut) myself|i (?:want to die|don't want to live|wish i (?:were|was) dead))\b/;
const CURRENT_HARM = /\b(?:(?:is|are) (?:hurting|hitting|kicking|punching|beating|attacking|threatening|abusing)|hurts|hits|attacks|threatens) (?:me|us) (?:right )?now\b/;
const PERSONAL_HARM = /\b(?:(?:hurt(?:s|ing)?|hit(?:s|ting)?|kick(?:s|ed|ing)?|punch(?:es|ed|ing)?|beat(?:s|ing)?|abus(?:es|ed|ing)|threaten(?:s|ed|ing)?|bully(?:ing)?|bullies|bullied) me|touch(?:es|ed) me (?:under my clothes|in a private place)|made me take off my clothes|won't let me leave)\b/;
const AMBIGUOUS = /\b(?:scared|afraid|followed|depress\w*|hurt\w*|harm\w*|hit(?:s|ting)?|beat(?:s|en|ing)?|touch\w*|died|die|jump(?:ing)? (?:off|from) (?:the |a )?(?:roof|bridge|building))\b/;
const SAFETY_LANGUAGE = /\b(?:unsafe|not safe|danger\w*|emergency|abus\w*|bull(?:y\w*|ied)|threat\w*|attack\w*|kill\w*|dead|suicid\w*|self[ -]harm|weapon\w*|guns?|knife|knives|blood\w*|overdose\w*|sex\w*|naked|private parts)\b/;
const UNSAFE_REQUEST = /^(?:(?:how (?:do|can|could|should) i|(?:show|tell|teach) me how to)\s+(?:hurt|kill|attack)\s+(?:someone|somebody|him|her|them)|(?:(?:can|could|would) you )?tell me (?:an? )?(?:gross )?(?:naked|sexual|sex) joke)\b/;
const DENIAL = /^(?:(?:no[,\s]+)?(?:no one|nobody) (?:is |has been )?(?:hurting|hitting|harming|attacking|threatening) (?:me|us)\b|i (?:don't|do not) want to (?:die|hurt myself|kill myself)\b|i(?:'m| am) (?:safe|not (?:in danger|being (?:hurt|hit|bullied|abused|threatened)))\b|(?:s?he|they|my \w+|the \w+) (?:isn't|is not|aren't|are not|didn't|did not|doesn't|does not) (?:hurt\w*|hit\w*|harm\w*|attack\w*|threaten\w*) (?:me|us)\b)/;
const FICTION_WORK = "(?:video game|game|story|book|movie|show|cartoon)";
const FICTION_PLACE = `(?:in|from) (?:the |a |my |our |this |that )?${FICTION_WORK}`;
const FICTION_ACTOR = `(?:(?:the|a|my) (?:${FICTION_WORK}|character|narrator)|(?:the|a|my) \\w+ ${FICTION_PLACE})`;
const FICTION_REPORT = `${FICTION_ACTOR} (?:said|says|reads?)`;
const FICTION_LEAD = new RegExp(`^(?:${FICTION_PLACE}|${FICTION_REPORT}|${FICTION_ACTOR} (?:died|dies|got hurt))\\b`);
const FICTION_TAIL = new RegExp(`^${FICTION_PLACE}(?: (?:right )?now)?$`);
const FICTION_QUOTE = new RegExp(String.raw`(\b${FICTION_REPORT}\b)\s*[:,]?\s*(?:"[^"]*"|'(?:[^']|'(?=\w))*')`, "g");
const FICTION_COMMA = new RegExp(`(^|[.?!;\\n,]\\s*|\\b(?:and|but|then|except|because|so) )(${FICTION_PLACE}),`, "g");
const MATH = /\b(?:scared|afraid) (?:of )?(?:getting|i(?:'ll)? get|i got) (?:the )?(?:math|answer|problem|question) wrong\b|\bhit (?:the )?(?:enter|submit|next)(?: (?:key|button))?\b/g;
const RETURN_TO_MATH = /^(?:no[,\s]+)?(?:(?:i mean(?:t)?|i was (?:only |just )?talking about|it was(?: only| just)?|it's(?: only| just)?) (?:the )?(?:math|maths|math problem|problem|question|game|story|book)|(?:(?:can|could) (?:i|we)|let's|i want to) (?:go back|go|get back|return) to (?:the )?(?:math|maths|math problem|problem|question)|(?:i need help|(?:can|could) you help me) with (?:the |this )?(?:math|maths|math problem|problem|question))[.!?]*$/;
const RETRACTION = /^i (?:don't|do not)$/;
const BALL_CORRECTION = /^(?:i mean(?:t)? (?:(?:he|she|they|my \w+) hit )?|(?:he|she|they|my \w+) hit )(?:the |a )?ball$/;
const FICTION_CORRECTION = new RegExp(`^(?:i mean(?:t)?(?: it was)?|that was) ${FICTION_PLACE}$`);
const UNCONFIRMED = /^["']|\b(?:if|pretend|what if) (?:i|he|she|they|someone|somebody|my)\b|\b(?:don't|do not|didn't|did not) (?:really )?think\b|\b(?:said|says|told me|read|reads|wrote|writes) (?:that )?(?=["']|(?:i|my|he|she|they|someone|somebody)\b)/;
const hasSafetyLanguage = (text: string): boolean => AMBIGUOUS.test(text) || SAFETY_LANGUAGE.test(text);

export const SAFETY_CLARIFICATION = "I'm not sure I understood. If you meant the math, you can say you want to go back to math. If you're worried about safety, tell a grown-up you trust. You don't have to share private details.";
export const SAFETY_PAUSE = "If you're worried about safety, tell a grown-up you trust. You don't have to share private details here.";

export interface ChildHearing { text: string; uncertain?: boolean; alternatives?: readonly string[] }

type Sensitive = "immediate" | "concern" | "unsafe_request" | "clarify";
type ClauseRead = Sensitive | "unclassified" | "benign" | null;

const normalize = (text: string) => text.normalize("NFKC").replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').toLowerCase().trim();

function readClaim(text: string): ClauseRead {
  if (FICTION_LEAD.test(text)) return "benign";
  for (const [pattern, reading] of [
    [IMMEDIATE, "immediate"], [CURRENT_HARM, "immediate"], [CONCERN, "concern"], [PERSONAL_HARM, "concern"],
    [UNSAFE_REQUEST, "unsafe_request"], [AMBIGUOUS, "clarify"], [SAFETY_LANGUAGE, "unclassified"],
  ] as const) {
    const match = pattern.exec(text);
    if (!match) continue;
    if (FICTION_TAIL.test(text.slice(match.index + match[0].length).trim())) return readClaim(text.slice(0, match.index).trim()) ?? "benign";
    if (UNCONFIRMED.test(text)) return hasSafetyLanguage(text) ? "clarify" : null;
    return reading;
  }
  return null;
}

function readClauses(text: string): ClauseRead[] {
  const said = normalize(text).replace(FICTION_QUOTE, "$1").replace(FICTION_COMMA, "$1$2 ")
    .replace(/\b(said|says|told me|read|reads|wrote|writes)\s*[:,]\s*(?=["'])/g, "$1 ");
  const clauses = said.split(/[.?!;\n,]+|\s+\b(?:and|but|then|except|because|so)\s+(?=(?:i|my|he|she|they|someone|somebody|there|the|a|no|nobody)\b)/)
    .map((clause) => clause.trim().replace(/\s+/g, " ").replace(/^(?:(?:maya|um|please|and|but|then|because|so)\s+)+/, ""));
  const reads = clauses.map((clause) => {
    const claim = clause.replace(DENIAL, "").replace(MATH, " ").trim();
    return readClaim(claim) ?? (claim !== clause ? "benign" : null);
  });
  clauses.forEach((clause, index) => {
    if (reads[index] !== "immediate" && reads[index] !== "concern") return;
    const following = clauses[index + 1] ?? "";
    const no = /^no(?: |$)/.test(following);
    const nextIndex = index + (following === "no" ? 2 : 1);
    const next = (clauses[nextIndex] ?? "").replace(/^no /, "");
    if (FICTION_CORRECTION.test(next) || (/\bhit(?:s|ting)? me\b/.test(clause) && (no || next.startsWith("i mean")) && BALL_CORRECTION.test(next)) ||
      (no && RETRACTION.test(next) && /^i want to (?:die|hurt myself|kill myself)$/.test(clause))) {
      reads[index] = reads[nextIndex] = "benign";
    }
  });
  return reads;
}

const PRIORITY = ["immediate", "concern", "unsafe_request", "clarify"] as const;
const hasSignal = (reads: ClauseRead[]) => reads.some((r) => r !== null && r !== "benign");

export function sensitiveHearing({ text, uncertain, alternatives }: ChildHearing): Sensitive | null {
  const primary = readClauses(text);
  if (uncertain && hasSignal(primary)) return "clarify";
  return PRIORITY.find((level) => primary.includes(level)) ??
    (alternatives?.some((a) => hasSignal(readClauses(a))) ? "clarify" : null);
}

export function sensitiveInput(text: string): Sensitive | null {
  return sensitiveHearing({ text });
}

export function closingSafetyRead(text: string): boolean {
  const reads = readClauses(text);
  return reads.includes("unclassified") && !PRIORITY.some((level) => reads.includes(level));
}

export function benignSafetyContext(text: string): boolean {
  const reads = readClauses(text);
  return reads.includes("benign") && !hasSignal(reads);
}

export function resolvesSafetyHold(text: string): boolean {
  const said = normalize(text).replace(/^no[,\s]+/, "");
  const denial = DENIAL.exec(said);
  return RETURN_TO_MATH.test(said) || (!!denial && /^(?:\s+(?:(?:right )?now|anymore))?[.!?]*$/.test(said.slice(denial[0].length)));
}

export function shareableTutorTurn(turn: { speaker: "maya" | "child"; text: string; alternatives?: readonly string[] }): boolean {
  return turn.speaker === "maya" || (!hasSignal(readClauses(turn.text)) && !turn.alternatives?.some((a) => hasSignal(readClauses(a))));
}
