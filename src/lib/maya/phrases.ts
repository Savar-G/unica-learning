// Maya's warm talk (D-196, review R374-1). Warm talk could undo a correct line ("Add 7 + 9." then "Do the opposite."),
// so it follows two rules:
//
// A. A turn that carries a math line takes its warm talk only from this code-written phrase bank, and the warm talk
//    comes before the math: the math line is the last thing said, so nothing can follow it and reverse it. A line is
//    math when any filled wording holds a number or a work word (session.ts, isMathLine): every line but the hello, so
//    a turn that restates the question or gets back to it follows this rule too (R374-2-1).
// B. A turn with no math line (the hello and talk around it, small-talk replies, check-ins, waiting, closing) may use
//    the model's own words, so Maya can answer "I have a dog!" like a person. Those words pass
//    the strict no-math rule (claims.ts), a ban on work instructions and on pointing back to an earlier sentence, and a
//    length cap. Words that fail are replaced by a bank phrase of the same purpose; the turn never fails. This is not
//    airtight (free words can always say something unhelpful), but the risk is low: these turns hold no math to
//    reverse, and the math line stays on the board.
//
// Every phrase praises effort, never correctness (only the checking lines say right or not yet), gives no instruction
// about the work, and does not point back to an earlier sentence. ", {name}" is the child's name, which code fills from
// the profile now and then (variety.ts); the model never writes it. Pure TypeScript.
import { talkMath } from "./claims";
import type { Act } from "./proposal";

export const PHRASE_GROUPS = ["encourage", "empathy", "checkin", "pacing", "thinkaloud", "hearing", "smalltalk", "opening", "closing"] as const;
export type PhraseGroup = (typeof PHRASE_GROUPS)[number];

/** The bank, by purpose. A phrase's id is `<group>.<index + 1>`; add phrases at the end so ids stay. */
export const PHRASES: Record<PhraseGroup, readonly string[]> = {
  encourage: [
    "You're working hard on this, {name}.", "I like how you keep trying.", "Great effort!", "You're doing a good job sticking with it.",
    "Keep going, you've got this.", "I can see you're thinking carefully.", "Nice focus!", "You're getting the hang of this, {name}.",
    "I love how you're not giving up.", "You're being really patient.", "Way to keep at it!", "You're thinking like a real detective.",
    "Good thinking, {name}.", "You're doing great work today.", "I'm proud of how hard you're trying.", "You're on a roll!",
    "You're a brave learner.", "Nice and steady, {name}.",
  ],
  empathy: [
    "This part can feel tricky.", "It's okay to find this hard.", "Lots of kids find this tricky.", "Trying again is how we learn.",
    "It's fine to feel stuck sometimes.", "You don't have to rush.", "We can figure this out together, {name}.", "I'm here to help.",
    "Tricky bits are how our brains grow.", "It's okay not to know yet.", "Everyone gets stuck sometimes.", "We'll work through it together.",
    "No worries, {name}. We've got time.", "Feeling unsure is totally normal.", "I'm here with you on this.", "Hard things get easier with practice.",
  ],
  checkin: [
    "Are you still there?", "How are you feeling about this?", "Do you want a little help?", "Would you like more time?",
    "Are you ready to keep going?", "Is everything okay?", "Let me know when you're ready.", "Take all the time you need, {name}.",
    "How's it going over there?", "Still with me, {name}?", "Do you need a moment?", "How are you doing?",
    "Want to keep going?", "Are you comfy and ready?",
  ],
  pacing: [
    "Take your time.", "No hurry.", "Let's go slowly.", "Let's take a deep breath.", "I'll wait for you.", "Let's take it bit by bit.",
    "Whenever you're ready.", "Let's pause for a moment.", "There's no rush at all, {name}.", "Slow and steady is great.",
    "We can take this nice and slow.", "I'm happy to wait.", "Let's not rush this.", "Ready when you are, {name}.",
  ],
  thinkaloud: [
    "Tell me what you're thinking.", "Can you say your idea out loud?", "How did you work it out?", "What made you think of it?",
    "Talk me through it.", "I'd love to hear your idea, {name}.", "What do you notice?", "What are you thinking of doing?",
    "What's going on in your head?", "Walk me through your thinking.", "How do you know?", "What's your plan?",
    "I'm curious how you figured it out.", "Tell me how you got there, {name}.",
  ],
  hearing: [
    "Sorry, I didn't catch it.", "Can you say it again, a bit slower?", "Could you say it again?", "I want to make sure I heard you.",
    "Thanks for your patience.", "Let me listen again.", "My ears missed it, sorry.", "Could you say it a little louder?",
    "I didn't quite hear you, {name}.", "Can you tell me again?", "Just a moment, I want to hear you properly.", "Sorry, it was hard to hear.",
  ],
  smalltalk: [
    "Hi! It's nice to meet you.", "Thanks for telling me.", "Sounds fun!", "Let's get back to your question.",
    "Maybe we can talk about it another time.", "I'm only able to help with your workbook today.", "Oh, how fun!", "I'd love to hear about it later.",
    "I love hearing about it, {name}!", "Cool! Now let's get back to work.", "What a nice thing to tell me.", "Let's save the fun stories for later.",
    "Ha, I like it!", "Good to know, {name}.",
  ],
  opening: [
    "Our team may review this call to make me better.", "Ready to get started?", "I'm happy to help you today.", "Let's work on this together.",
    "It's nice to see you, {name}.", "Let's have some fun with this.", "I'm glad you're here.", "Shall we get going?",
    "We can go at your speed.", "I'm excited to work with you today, {name}.", "Let's begin whenever you're ready.", "Thanks for coming to work with me.",
  ],
  closing: [
    "Thanks for working with me today.", "You worked really hard.", "See you next time!", "Bye for now!", "Have a great day!",
    "I hope you enjoyed this.", "Great work today, {name}.", "I had fun working with you.", "Take care, {name}!", "You should feel proud of your effort.",
    "Talk soon!", "Enjoy the rest of your day!", "Thanks for being such a good thinker.",
  ],
};

/** The acts each purpose fits. */
export const PHRASE_ACTS: Record<PhraseGroup, readonly Act[]> = {
  encourage: ["guide", "try_target", "example_step", "accept_answer", "give_answer", "ask_write", "clarify", "repair", "check_in", "wait"],
  empathy: ["guide", "try_target", "example_step", "give_answer", "redirect", "close", "check_in", "repair", "confirm", "clarify"],
  checkin: ["check_in", "wait", "confirm", "guide", "offer_other_input"],
  pacing: ["wait", "check_in", "guide", "example_step", "try_target", "give_answer"],
  thinkaloud: ["guide", "accept_answer", "ask_write", "clarify", "try_target", "open"],
  hearing: ["confirm", "offer_other_input"],
  smalltalk: ["open", "redirect", "close", "clarify"],
  opening: ["open"],
  closing: ["close", "ask_write"],
};

/** The purpose of a bank phrase that replaces free words that fail the guards, by act. */
export const FALLBACK_GROUP: Partial<Record<Act, PhraseGroup>> = {
  open: "opening", clarify: "smalltalk", example_step: "pacing", try_target: "encourage", guide: "encourage", accept_answer: "encourage",
  give_answer: "empathy", ask_write: "encourage", close: "closing", confirm: "hearing", offer_other_input: "hearing", wait: "pacing",
  check_in: "checkin", redirect: "smalltalk", repair: "empathy",
};

/**
 * Words free talk may not hold beyond the no-math rule: pointing back to an earlier sentence ("do the opposite", "never
 * mind", "ignore it") and instructions about the work. Rule B; see the file header.
 */
const BACK_OR_WORK: ReadonlySet<string> = new Set([
  "that", "those", "opposite", "opposites", "instead", "ignore", "ignored", "ignoring", "undo", "undone", "forget", "forgot", "nevermind",
  "reverse", "reversed", "backwards", "backward", "swap", "switch", "flip", "cancel", "scratch", "previous", "earlier", "rather", "actually",
  "redo", "erase", "change", "fix", "fixed", "replace", "look", "try", "check", "draw", "circle", "underline", "copy", "compare", "fill",
  "finish", "step", "steps", "move", "subtract", "add", "carry", "borrow", "said", "told", "meant",
]);
/** Phrases that are fine although a word in them is on the list. */
const ALLOWED_PAIRS: ReadonlySet<string> = new Set<string>();
const BANNED_PAIRS: ReadonlySet<string> = new Set(["never mind", "not really", "just kidding"]);

/** Free talk is at most this many sentences, words in a sentence, and characters. */
export const FREE_TALK_LIMITS = { sentences: 2, words: 16, chars: 160 } as const;

/**
 * Why free talk fails the guards of rule B, or null when it passes: math (the strict no-math rule), a word that points
 * back or instructs the work, the child's name (code writes it, never the model), or the length cap.
 */
export function freeTalkProblem(text: string, childName: string | null = null): string | null {
  const t = text.trim();
  if (t === "" || t.length > FREE_TALK_LIMITS.chars) return "length";
  if (!/[.?!]["')\]]*$/.test(t)) return "not whole sentences";
  const sentences = t.split(/(?<=[.?!])\s+/).filter(Boolean);
  if (sentences.length > FREE_TALK_LIMITS.sentences) return "more than two sentences";
  if (sentences.some((s) => s.split(/\s+/).length > FREE_TALK_LIMITS.words)) return "a long sentence";
  const math = talkMath(t);
  if (math !== null) return `math: ${math}`;
  const words = (t.toLowerCase().match(/[\p{L}'’]+/gu) ?? []).map((w) => w.replace(/['’]/g, ""));
  for (const [i, w] of words.entries()) {
    const pair = `${w} ${words[i + 1] ?? ""}`;
    if (BANNED_PAIRS.has(pair)) return pair;
    if (ALLOWED_PAIRS.has(pair) || ALLOWED_PAIRS.has(`${words[i - 1] ?? ""} ${w}`)) continue;
    if (BACK_OR_WORK.has(w)) return w;
  }
  const name = childName?.trim().toLowerCase();
  if (name && words.includes(name.replace(/['’]/g, ""))) return "the child's name";
  return null;
}
