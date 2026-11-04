/**
 * A story's numbers and its question are code's (Codex at e6d79b6a, B1, P0, redesigned fail-closed). Code writes every
 * story's text: a step template, a planned item, or a code wording of the item's operation. The writer may choose the
 * person and the thing from the lists code offers; every other word stays code's. So a story prints exactly code's text
 * with only its names, things and pronouns changed (`storyKey`), and the item check and the book check refuse anything
 * else: "It puts 800 leaves in a jar" never replaces code's "It gives away 800 leaves". The take-away verbs then only
 * have to hold for code's own fixed frames, which a test enumerates.
 */
import { bcStepProgressions } from "@/lib/workbook-curriculum";
import type { QuestionPackage } from "@/lib/question-package";
import { PEOPLE, printedMinus, THINGS } from "@/lib/workbook-wording";
import { INTEREST_PLACES, INTEREST_THINGS } from "@/lib/workbook-interests";

let lists: { names: RegExp; things: RegExp } | null = null;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const forms = (w: string) => [w, w.replace(/ies$/, "y"), w.replace(/es$/, ""), w.replace(/s$/, ""), `${w}s`, `${w}es`];

function wordLists() {
  if (lists) return lists;
  const c = bcStepProgressions().contexts;
  const names = [...new Set([...PEOPLE, ...(c?.people ?? []).map((p) => p.name), "Sam"])];
  const things = [...new Set([...THINGS, ...INTEREST_THINGS, ...(c?.things ?? []), ...(c?.foods ?? []), ...(c?.animals ?? []), ...(c?.containers ?? []), "points", "tickets", "people"].flatMap(forms).concat(INTEREST_PLACES, c?.places ?? []))]
    .filter((w) => w.length > 1).sort((a, b) => b.length - a.length);
  lists = { names: new RegExp(`\\b(?:${names.map(escape).join("|")})(?:'s)?\\b`, "g"), things: new RegExp(`\\b(?:${things.map(escape).join("|")})\\b`, "gi") };
  return lists;
}

/** A story's text with its person, thing and pronouns taken out, and its numbers as one form ("10 000" is 10000). */
export function storyKey(text: string): string {
  const { names, things } = wordLists();
  return text.replace(/(\d)[   ](?=\d{3}\b)/g, "$1").replace(/[−–]/g, "-")
    .replace(names, "_who").replace(things, "_thing").replace(/\b(?:he|she|they|him|her|them|his|their|hers)\b/gi, "_who")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** Whether a printed story is code's text with only its person, thing and pronouns changed. */
export const sameStory = (printed: string, code: string): boolean => storyKey(printed) === storyKey(code);

/** A story with numbers: a person or a named thing, and a digit. */
export function isNumberStory(text: string): boolean {
  if (!/\d/.test(text)) return false;
  const { names, things } = wordLists();
  return new RegExp(names.source).test(text) || new RegExp(things.source, "i").test(text);
}

/**
 * Why a printed story is not code's, or null (Savar, 2026-11-04, B1 final): the writer edits no story text, so a number
 * story prints code's text character for character, its plan's or code's wording of its operation; with neither it fails.
 * Nothing is exempt.
 */
export function codeStoryProblem(p: QuestionPackage, codeText: string | null | undefined): string | null {
  if (!isNumberStory(p.text)) return null;
  if (codeText && p.text === printedMinus(codeText)) return null;
  return codeText ? `the story's words are not code's ("${p.text.slice(0, 50)}"): a story prints code's text exactly` : `the story has no text of code's ("${p.text.slice(0, 50)}"): a story's words come from code`;
}
