import { describe, expect, it } from "vitest";
import { INTERESTS } from "@/lib/learning-style";
import type { QuestionPackage } from "@/lib/question-package";
import { codeStoryProblem, isNumberStory, sameStory, storyKey } from "@/lib/workbook-code-story";
import { bcStepProgressions } from "@/lib/workbook-curriculum";
import { prepareTemplate, seededRandom } from "@/lib/workbook-curriculum/template";
import { INTEREST_PLACES, INTEREST_THINGS, WORKBOOK_INTERESTS } from "@/lib/workbook-interests";
import { COMPACT_STORY_FRAMES } from "@/lib/workbook-story-bank";
import { FRAMES, fillFrame, printedMinus, quantityStoryProblem, storyProblem, takeAwayProblem } from "@/lib/workbook-wording";

// Closed, reviewed vocabulary for ages 6-12. Each entry is one separable object, not a mass noun,
// a live animal, a weapon or a hazardous tool. Toys keep rockets and vehicles small and harmless.
// Every object can be red or blue, big or small, carried in a bag, put on a plate or shelf,
// and given away. New words need this same review and an independent singular spelling here.
const ONE: Record<string, string> = {
  "animal stickers": "animal sticker", "animal cards": "animal card", "toy animals": "toy animal",
  balls: "ball", medals: "medal", jerseys: "jersey",
  "star stickers": "star sticker", "planet cards": "planet card", "toy rockets": "toy rocket",
  spoons: "spoon", cups: "cup", "cookie cutters": "cookie cutter",
  counters: "counter", tokens: "token", "game cards": "game card",
  bells: "bell", shakers: "shaker", "toy drums": "toy drum",
  crayons: "crayon", pencils: "pencil", "paint pots": "paint pot",
  shells: "shell", pebbles: "pebble", "pine cones": "pine cone",
  "toy cars": "toy car", "toy trains": "toy train", "toy trucks": "toy truck",
  blocks: "block", "toy bricks": "toy brick", "toy wheels": "toy wheel",
};

// Public venues with articles. These support visits, signs, groups, outdoor measurements on the
// grounds and maps. No place asks a child to enter traffic, a work site or outer space.
const PLACES = [
  "the wildlife park", "the zoo", "the sports park", "the sports camp", "the space museum", "the science park",
  "the food fair", "the farmers market", "the games fair", "the games club", "the music camp", "the music festival",
  "the art fair", "the art camp", "the nature park", "the nature camp", "the train museum", "the transport fair",
  "the model fair", "the building club",
];

const pkg = (text: string): QuestionPackage => ({
  id: "interest-story", ref: { source: "workbook", workbookId: "interest-book", page: 1, question: 1 },
  templateId: null, textSource: "code", text, answer: null, operation: null, steps: [],
  skill: { standard: "2.1", skills: [] }, level: 4, difficulty: 1, wrongAnswers: [], easierExample: null,
});

describe("learning-card interest vocabulary", () => {
  it("covers exactly the offered interests with reviewed things and places", () => {
    expect(Object.keys(WORKBOOK_INTERESTS).sort()).toEqual(INTERESTS.map((i) => i.id).sort());
    expect([...INTEREST_THINGS].sort()).toEqual(Object.keys(ONE).sort());
    expect([...INTEREST_PLACES].sort()).toEqual([...PLACES].sort());
    for (const { id } of INTERESTS) {
      const words = WORKBOOK_INTERESTS[id];
      expect(words.things.length, id).toBeGreaterThanOrEqual(3);
      expect(words.places.length, id).toBeGreaterThanOrEqual(2);
      expect(new Set(words.things).size).toBe(words.things.length);
      expect(new Set(words.places).size).toBe(words.places.length);
      for (const word of [...words.things, ...words.places]) expect(word).toMatch(/^[a-z]+(?: [a-z]+)*$/);
    }
  });

  it.each(INTEREST_THINGS)("fills every generic and compact frame with %s", (thing) => {
    const frames = [
      ...FRAMES.filter((f) => f.f.includes("{thing}")),
      ...Object.entries(COMPACT_STORY_FRAMES).flatMap(([op, texts]) => texts.filter((f) => f.includes("{thing}")).map((f) => ({ f, op }))),
    ];
    expect(new Set(frames.map((f) => f.op))).toEqual(new Set(["add", "subtract", "missing-addend", "multiply", "divide"]));
    // Zero, singular in each numeric position, ordinary counts and larger collections.
    for (const f of frames) for (const [a, b] of [[0, 1], [1, 1], [1, 2], [2, 1], [7, 4], [120, 30]]) {
      const t = f.op === "multiply" || f.op === "divide" ? a * b : a + b;
      for (const name of ["Mia", "Ben"]) {
        const text = fillFrame(f.f, { a, b, t }, name, thing);
        expect(text, f.f).not.toMatch(/[{}]|(?:^|\. )(?:He|She) have\b/);
        expect(text, f.f).not.toMatch(new RegExp(`\\b1 (?:red |blue |big |small )?${thing}\\b`));
        expect(storyProblem(text, { thing }), text).toBeNull();
        expect(quantityStoryProblem(text, { thing }), text).toBeNull();
        if (f.op === "subtract") expect(takeAwayProblem(text, a), text).toBeNull();
        expect(codeStoryProblem(pkg(text), text), text).toBeNull();
        // The operation's numbers and the frame's wording survive noun substitution.
        expect(text.match(/\d+/g)).toEqual(fillFrame(f.f, { a, b, t }, name, "shells").match(/\d+/g));
        expect(sameStory(text, fillFrame(f.f, { a, b, t }, name, "shells")), text).toBe(true);
      }
    }
    expect(fillFrame("1 {thing}; 1 red {thing}; 2 {thing}; 21 {thing}", { a: 0, b: 0, t: 0 }, "Mia", thing))
      .toBe(`1 ${ONE[thing]}; 1 red ${ONE[thing]}; 2 ${thing}; 21 ${thing}`);
  });

  it.each(INTEREST_THINGS)("checks %s without supplied story facts and rejects keeping verbs", (thing) => {
    for (const noun of [thing, ONE[thing]]) {
      const n = noun === thing ? 2 : 1;
      expect(isNumberStory(`${n} ${noun}.`)).toBe(true);
      expect(quantityStoryProblem(`Count the ${noun}. How many?`)).not.toBeNull();
      expect(quantityStoryProblem(`Mia has ${n} ${noun}. How many does she have now?`)).toMatch(/names the counted thing/);
      expect(storyKey(`Mia has ${n} ${noun}.`)).toBe(`_who has ${n} _thing.`);
    }
    const keep = `Mia has 9 ${thing}. She puts 4 in a jar. How many ${thing} does she have now?`;
    const remove = `Mia has 9 ${thing}. She gives 4 away. How many ${thing} does she have now?`;
    expect(takeAwayProblem(keep, 5)).not.toBeNull();
    expect(takeAwayProblem(keep.replace("does she have now", "are not in the jar"), 5)).toBeNull();
    expect(takeAwayProblem(remove, 5)).toBeNull();
    expect(sameStory(keep, remove)).toBe(false);
    expect(codeStoryProblem(pkg(keep), remove)).not.toBeNull();
    // A known noun is still not permission for the writer to change code's text (D-231).
    if (thing !== "shells") expect(codeStoryProblem(pkg(remove), remove.replaceAll(thing, "shells")), thing).not.toBeNull();
  });

  it.each(INTEREST_PLACES)("fills every curriculum place template with %s without changing its maths", (place) => {
    const curriculum = bcStepProgressions();
    let checked = 0;
    for (const level of curriculum.levels) for (const skill of curriculum.levelSkills(level.id) ?? []) {
      for (const step of curriculum.skillSteps(skill.id) ?? []) for (const template of step.templates ?? []) {
        if (!template.text.includes("{places}")) continue;
        const contexts = { ...curriculum.contexts, places: [place] };
        const baseline = { ...curriculum.contexts, places: ["the park"] };
        const item = prepareTemplate(step, template, contexts).fill(seededRandom(3));
        const original = prepareTemplate(step, template, baseline).fill(seededRandom(3));
        expect(item.text, template.text).toContain(place);
        expect(item.text).not.toContain("{places}");
        expect(item.answer, item.text).toEqual(original.answer);
        expect(item.text.replaceAll(place, "the park")).toBe(original.text);
        expect(sameStory(item.text, original.text), item.text).toBe(true);
        expect(codeStoryProblem(pkg(printedMinus(item.text)), item.text)).toBeNull();
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(40);
    expect(storyKey(`7 people visited ${place}.`)).toBe("7 _thing visited _thing.");
    expect(isNumberStory(`7 at ${place}.`)).toBe(true);
  });
});
