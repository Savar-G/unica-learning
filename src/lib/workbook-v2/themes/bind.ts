// Binds the rows of word problems to one book: the questions of its region, each with the scenario of its theme. A
// question of other regions is left out of the row; a row with too few questions for a region is a problem of the
// snapshot, so every sheet can be made for every region pack.
import type { FieldReader, Fields } from "../bank/fields";
import { longestAnswer, STORY_SHAPE_ID, storyItem, type BoundQuestion, type StoryLimits, type StoryQuestion } from "../shapes/story";
import type { Item } from "../shapes/shape";
import { rangesOf, widestValues } from "./ranges";
import { DEFAULT_INTEREST, type Scenario, type StoryBank, type StoryChoice } from "./types";

export const isStoryRow = (fields: Fields): boolean => fields.shape === STORY_SHAPE_ID;

/** The scenario of a kind for an interest: its own, or the default one when the interest has none of that kind. */
function scenarioFor(bank: StoryBank, interest: string, kind: string): Scenario | undefined {
  return bank.scenarios.find((s) => s.interest === interest && s.kind === kind) ?? bank.scenarios.find((s) => s.interest === DEFAULT_INTEREST && s.kind === kind);
}

/**
 * The questions of a row for one choice of theme and region, in the order of the row. `seen` holds the phrasings that the
 * child has read, each as `<question>/<phrasing>`.
 */
export function bindStory(ids: readonly string[], bank: StoryBank, { interest, region }: StoryChoice, seen: readonly string[] = []): StoryLimits {
  const pack = bank.packs.get(region);
  if (!pack) throw new Error(`there is no region pack "${region}"`);
  const questions = ids.flatMap((id): BoundQuestion[] => {
    const question = bank.questions.get(id);
    if (!question || (question.regions !== null && !question.regions.includes(region))) return [];
    const scenario = scenarioFor(bank, interest, question.scenarioKind);
    const found = scenario ? rangesOf(question, scenario) : null;
    return scenario && found && "ranges" in found ? [{ question, scenario, pack, ranges: found.ranges }] : [];
  });
  return { ids, interest, region, questions, seen };
}

/** The interests that some scenario has. */
export const interestsOf = (bank: StoryBank): string[] => [...new Set(bank.scenarios.map((s) => s.interest))];

/**
 * The widest forms of a story row across every eligible region pack, compatible scenario and phrasing: widest slot values
 * and longest answer for each (question, scenario) pair, reused across every pack and phrasing so none escapes snapshot fit.
 */
export function storyForms(ids: readonly string[], bank: StoryBank): Item<StoryQuestion>[] {
  const forms: Item<StoryQuestion>[] = [];
  for (const id of ids) {
    const question = bank.questions.get(id);
    if (!question) continue;
    const packs = [...bank.packs.values()].filter((p) => question.regions === null || question.regions.includes(p.id));
    if (packs.length === 0) continue;
    for (const scenario of bank.scenarios.filter((s) => s.kind === question.scenarioKind)) {
      const found = rangesOf(question, scenario);
      if (!("ranges" in found)) continue;
      const widest = widestValues(found.ranges);
      const longest = longestAnswer({ question, scenario, pack: packs[0], ranges: found.ranges });
      for (const pack of packs) {
        const bound: BoundQuestion = { question, scenario, pack, ranges: found.ranges };
        for (let i = 0; i < question.phrasings.length; i++) {
          const wide = storyItem(bound, i, widest);
          forms.push(wide);
          const long = storyItem(bound, i, longest);
          if (long.answer.parts[0].value.length > wide.answer.parts[0].value.length) forms.push(long);
        }
      }
    }
  }
  return forms;
}

/**
 * The limits of a story row: the ids of its questions, all known and different. They are bound to the default theme and
 * region; a book binds them again to its own. Each region pack must leave as many questions as the row has places.
 */
export function readStoryRow(r: FieldReader, at: string, raw: unknown, items: number | null, bank: StoryBank | null): StoryLimits | null {
  if (!bank) {
    r.problem(at, "a story row needs the questions, scenarios and region packs of its snapshot");
    return null;
  }
  const fields = r.object(`${at}, limits`, raw, ["questions"]);
  if (!fields) return null;
  const ids = r.list(`${at}, limits`, fields, "questions");
  const before = r.problems.length;
  for (const id of ids) if (typeof id !== "string" || !bank.questions.has(id)) r.problem(at, `there is no question ${JSON.stringify(id)}`);
  r.unique("question", ids.filter((id) => typeof id === "string"), at);
  if (r.problems.length > before || ids.length === 0) return null;
  const names = ids as string[];
  for (const region of bank.packs.keys()) {
    const { questions } = bindStory(names, bank, { interest: DEFAULT_INTEREST, region });
    if (items !== null && questions.length < items) r.problem(at, `the row asks for ${items} different questions and the region "${region}" has ${questions.length} of them`);
  }
  return bindStory(names, bank, { interest: DEFAULT_INTEREST, region: bank.defaultRegion });
}
