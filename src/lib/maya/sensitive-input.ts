const PERSON = String.raw`(?:someone|somebody|my (?:mom|mum|mother|dad|father|parent|stepdad|stepmom|brother|sister|uncle|aunt|teacher|coach|friend)|he|she|they)`;
const IMMEDIATE = new RegExp(String.raw`^(?:i(?:'m| am) (?:in (?:immediate )?danger|not safe right now)|i (?:want|plan|am going) to (?:hurt|kill) myself|i(?:'m| am) going to (?:hurt|kill) (?:myself|him|her|them|someone)|${PERSON} (?:is |are )?(?:hurting|hitting|attacking|threatening) me (?:right )?now)\b`, "i");
const CONCERN = new RegExp(String.raw`^(?:i (?:do not|don't) feel safe|i(?:'m| am| feel) (?:not safe|unsafe)|i(?:'m| am) being (?:hurt|hit|bullied|abused|threatened)|i (?:hurt|cut) myself|i (?:want to die|don't want to live)|${PERSON} (?:at home )?(?:(?:keeps? |has been |is |are )?(?:hurt(?:s|ing)?|hit(?:s|ting)?|kick(?:s|ed|ing)?|punch(?:es|ed|ing)?|beat(?:s|ing)?|abus(?:es|ed|ing)|threaten(?:s|ed|ing)?|bully(?:ing)?|bullies|bullied) me|touch(?:es|ed) me (?:under my clothes|in a private place)|made me take off my clothes|won't let me leave))\b`, "i");
const SENSITIVE = /\b(?:hurt\w*|harm\w*|unsafe|not safe|scared|afraid|danger\w*|emergency|followed|hit(?:s|ting)?|beat(?:s|en|ing)?|touch\w*|abus\w*|bully\w*|bullied|threat\w*|kill\w*|died|die|depress\w*|suicid\w*|self[ -]harm|weapon\w*|guns?|knife|knives|blood\w*|overdose\w*|sex\w*|naked|private parts)\b/i;
const UNSAFE_REQUEST = /^(?:(?:how (?:do|can|could|should) i|(?:show|tell|teach) me how to)\s+(?:hurt|kill|attack)\s+(?:someone|somebody|him|her|them)|(?:(?:can|could|would) you )?tell me (?:an? )?(?:gross )?(?:naked|sexual|sex) joke)\b/i;

export const SAFETY_CLARIFICATION = "I'm not sure I understood. Is this about the math, or are you saying someone might be getting hurt? You don't have to share private details.";
export const SAFETY_PAUSE = "If you're worried about safety, tell a grown-up you trust. You don't have to share private details here.";

export function sensitiveInput(text: string): "immediate" | "concern" | "unsafe_request" | "clarify" | null {
  const said = text.normalize("NFKC").replace(/[‘’ʼ]/g, "'");
  const clauses = said.split(/[.!?;\n]+/).map((clause) => clause.trim().replace(/\s+/g, " ").replace(/^(?:(?:maya|um|please)[,\s]+)+/i, ""));
  if (clauses.some((clause) => IMMEDIATE.test(clause))) return "immediate";
  if (clauses.some((clause) => CONCERN.test(clause))) return "concern";
  if (clauses.some((clause) => UNSAFE_REQUEST.test(clause))) return "unsafe_request";
  return SENSITIVE.test(said) ? "clarify" : null;
}

export function shareableTutorTurn(turn: { speaker: "maya" | "child"; text: string; alternatives?: readonly string[] }): boolean {
  return turn.speaker === "maya" || (sensitiveInput(turn.text) === null && !turn.alternatives?.some((a) => sensitiveInput(a) !== null));
}
