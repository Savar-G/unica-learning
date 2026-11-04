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
import { codeWordings, isWorded, PEOPLE, THINGS, type WordingKind } from "@/lib/workbook-wording";

let lists: { names: RegExp; things: RegExp } | null = null;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const forms = (w: string) => [w, w.replace(/ies$/, "y"), w.replace(/es$/, ""), w.replace(/s$/, ""), `${w}s`, `${w}es`];

function wordLists() {
  if (lists) return lists;
  const c = bcStepProgressions().contexts;
  const names = [...new Set([...PEOPLE, ...(c?.people ?? []).map((p) => p.name), "Sam"])];
  const things = [...new Set([...THINGS, ...(c?.things ?? []), ...(c?.foods ?? []), ...(c?.animals ?? []), ...(c?.containers ?? []), "points", "tickets", "people"].flatMap(forms))]
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

const KINDS: WordingKind[] = ["story", "picture", "fact", "missing-part", "line"];

/** Code's wordings of an operation, every kind and option: what a code-worded story may print. */
function wordingsOf(p: QuestionPackage): string[] {
  const op = p.operation;
  if (!op || !isWorded(op)) return [];
  const out: string[] = [];
  for (const step of [false, true]) for (const subtraction of [false, true]) for (const figure of [p.item?.figure ?? null, null]) {
    try {
      out.push(...codeWordings(op, { format: p.item?.format ?? "write-number", figure, name: "Mia", thing: "shells", kinds: KINDS, step, subtraction, variant: 0 }));
    } catch { /* an option code does not word */ }
  }
  return out;
}

/**
 * Why a printed story is not code's, or null: compared with its plan's text when code planned it, else with code's
 * wordings of its operation; a number story with neither fails.
 */
export function codeStoryProblem(p: QuestionPackage, planText: string | null | undefined): string | null {
  if (!isNumberStory(p.text)) return null;
  if (planText) return sameStory(p.text, planText) ? null : `the story's words are not code's ("${p.text.slice(0, 50)}"): only the person and the thing may change`;
  const wordings = wordingsOf(p);
  if (wordings.some((w) => sameStory(p.text, w))) return null;
  return `the story's words are not code's ("${p.text.slice(0, 50)}"): a story's numbers and question come from code`;
}
