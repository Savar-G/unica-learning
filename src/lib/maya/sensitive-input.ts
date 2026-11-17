const IMMEDIATE = /^(?:i(?:'m| am) (?:in (?:immediate )?danger|not safe (?:right )?now)|i (?:want|plan|intend) to (?:hurt|kill) myself|i(?:'m| am) (?:about|going) to (?:(?:hurt|kill) (?:myself|him|her|them|someone|somebody)|end my life|jump (?:off|from) (?:the |a )?(?:roof|bridge|building))|i(?:'m| am) being (?:hurt|hit|attacked|threatened) (?:right )?now)\b/;
const CONCERN = /^(?:i (?:do not|don't) feel safe|i(?:'m| am| feel) (?:not safe|unsafe)|i(?:'m| am) being (?:hurt|hit|bullied|abused|threatened)|i (?:hurt|cut) myself|i (?:want to die|don't want to live|wish i (?:were|was) dead))\b/;
const CURRENT_HARM = /\b(?:(?:is|are) (?:hurting|hitting|kicking|punching|beating|attacking|threatening|abusing)|hurts|hits|attacks|threatens) (?:me|us) (?:right )?now\b/;
const PERSONAL_HARM = /\b(?:(?:hurt(?:s|ing)?|hit(?:s|ting)?|kick(?:s|ed|ing)?|punch(?:es|ed|ing)?|beat(?:s|ing)?|abus(?:es|ed|ing)|threaten(?:s|ed|ing)?|bully(?:ing)?|bullies|bullied) me|touch(?:es|ed) me (?:under my clothes|in a private place)|made me take off my clothes|won't let me leave)\b/;
const AMBIGUOUS = /\b(?:scared|afraid|followed|depress\w*|hurt\w*|harm\w*|hit(?:s|ting)?|beat(?:s|en|ing)?|touch\w*|died|die|jump(?:ing)? (?:off|from) (?:the |a )?(?:roof|bridge|building))\b/;
const SAFETY_LANGUAGE = /\b(?:unsafe|not safe|danger\w*|emergency|abus\w*|bull(?:y\w*|ied)|threat\w*|attack\w*|kill\w*|dead|suicid\w*|self[ -]harm|weapon\w*|guns?|knife|knives|blood\w*|overdose\w*|sex\w*|naked|private parts)\b/;
const UNSAFE_REQUEST = /^(?:(?:how (?:do|can|could|should) i|(?:show|tell|teach) me how to)\s+(?:hurt|kill|attack)\s+(?:someone|somebody|him|her|them)|(?:(?:can|could|would) you )?tell me (?:an? )?(?:gross )?(?:naked|sexual|sex) joke)\b/;
const DENIAL = /^(?:(?:no[,\s]+)?(?:no one|nobody) (?:is |has been )?(?:hurting|hitting|harming|attacking|threatening) (?:me|us)\b|i (?:don't|do not) want to (?:die|hurt myself|kill myself)\b|i(?:'m| am) (?:safe|not (?:in danger|being (?:hurt|hit|bullied|abused|threatened)))\b|(?:s?he|they|my \w+|the \w+) (?:isn't|is not|aren't|are not|didn't|did not|doesn't|does not) (?:hurt\w*|hit\w*|harm\w*|attack\w*|threaten\w*) (?:me|us)\b)/;
const FICTION = /(?:\b(?:in|from) (?:the |a |my |our |this |that )?(?:video game|game|story|book|movie|show|cartoon)\b|\b(?:the|a) (?:character|narrator|game|story|book|movie|show|cartoon) (?:\w+ ){0,5}(?:said|says|reads?|died|dies|got hurt)\b)/;
const MATH = /\b(?:scared|afraid) (?:of )?(?:getting|i(?:'ll)? get|i got) (?:the )?(?:math|answer|problem|question) wrong\b|\bhit (?:the )?(?:enter|submit|next) (?:key|button)?\b/;
const RETURN_TO_MATH = /^(?:no[,\s]+)?(?:(?:i mean(?:t)?|i was (?:only |just )?talking about|it was(?: only| just)?|it's(?: only| just)?) (?:the )?(?:math|maths|math problem|problem|question|game|story|book)|(?:(?:can|could) (?:i|we)|let's|i want to) (?:go back|go|get back|return) to (?:the )?(?:math|maths|math problem|problem|question)|(?:i need help|(?:can|could) you help me) with (?:the |this )?(?:math|maths|math problem|problem|question))[.!?]*$/;
const RETRACTION = /^i (?:don't|do not)$/;
const UNCONFIRMED = /^["']|\b(?:if|pretend|what if) (?:i|he|she|they|someone|somebody|my)\b|\b(?:don't|do not|didn't|did not) (?:really )?think\b|\b(?:said|says|told me|read|reads|wrote|writes) (?:that )?(?=["']|(?:i|my|he|she|they|someone|somebody)\b)/;
const hasSafetyLanguage = (text: string): boolean => AMBIGUOUS.test(text) || SAFETY_LANGUAGE.test(text);

export const SAFETY_CLARIFICATION = "I'm not sure I understood. If you meant the math, you can say you want to go back to math. If you're worried about safety, tell a grown-up you trust. You don't have to share private details.";
export const SAFETY_PAUSE = "If you're worried about safety, tell a grown-up you trust. You don't have to share private details here.";

export interface ChildHearing { text: string; uncertain?: boolean; alternatives?: readonly string[] }

type Sensitive = "immediate" | "concern" | "unsafe_request" | "clarify";
type ClauseRead = Sensitive | "unclassified" | null;

const normalize = (text: string) => text.normalize("NFKC").replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').toLowerCase().trim();

function readClauses(text: string): ClauseRead[] {
  const said = normalize(text).replace(/\b(said|says|told me|read|reads|wrote|writes)\s*[:,]\s*(?=["'])/g, "$1 ");
  const clauses = said.split(/[.?!;\n,]+|\s+\b(?:and|but|then|except)\s+(?=(?:i\b|[ms]y\b|he\b|she\b|they\b|someone\b|somebody\b|the\b|a\b|no\b|nobody\b))/)
    .map((clause) => clause.trim().replace(/\s+/g, " ").replace(/^(?:(?:maya|um|please|and|but|then)[\s]+)+/, ""));
  return clauses.map((clause, index) => {
    if (DENIAL.test(clause) || FICTION.test(clause) || MATH.test(clause)) return null;
    const next = clauses[index + 1] === "no" ? clauses[index + 2] : undefined;
    if (/^i want to (?:die|hurt myself|kill myself)$/.test(clause) && next && RETRACTION.test(next)) return null;
    if (UNCONFIRMED.test(clause)) return hasSafetyLanguage(clause) ? "clarify" : null;
    if (IMMEDIATE.test(clause) || CURRENT_HARM.test(clause)) return "immediate";
    if (CONCERN.test(clause) || PERSONAL_HARM.test(clause)) return "concern";
    if (UNSAFE_REQUEST.test(clause)) return "unsafe_request";
    if (AMBIGUOUS.test(clause)) return "clarify";
    return SAFETY_LANGUAGE.test(clause) ? "unclassified" : null;
  });
}

const PRIORITY = ["immediate", "concern", "unsafe_request", "clarify"] as const;
const hasSignal = (reads: ClauseRead[]) => reads.some((r) => r !== null);

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
  const said = normalize(text);
  return !hasSignal(readClauses(said)) &&
    (DENIAL.test(said) || FICTION.test(said) || MATH.test(said) || /\bno[,.!?;\s]+i (?:don't|do not)\b/.test(said) && AMBIGUOUS.test(said));
}

export function resolvesSafetyHold(text: string): boolean {
  const said = normalize(text);
  return (DENIAL.test(said) || RETURN_TO_MATH.test(said)) && !hasSignal(readClauses(said));
}

export function shareableTutorTurn(turn: { speaker: "maya" | "child"; text: string; alternatives?: readonly string[] }): boolean {
  return turn.speaker === "maya" || (!hasSignal(readClauses(turn.text)) && !turn.alternatives?.some((a) => hasSignal(readClauses(a))));
}
