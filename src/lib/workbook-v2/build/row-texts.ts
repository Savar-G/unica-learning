// Every text that a question of a row can print, at every place of its template, for the fit check of the bank. The widest
// question of a row has the most digits. It need not have the widest ones: "20" is wider than "10", and a row can print both.
import type { SnapshotRow } from "../bank/snapshot";
import type { Answer, Face, Ink, Side } from "../contract";
import { itemRegions } from "../layout/build-pages";
import { fitProblem, needsOf, questionText, type ItemPlace, type PageTemplate } from "../layout/templates";
import type { TextInk } from "../checks/texts";
import { formsOf } from "../shapes/shape";

/** A text in the place of one rectangle, as a problem names it. */
export interface RowText { ink: Ink; name: string; side: Side }
export interface RowTexts { texts: RowText[]; problems: string[] }

interface Asked { face: Face; answer: Answer }
/** Questions that print in the same rectangles of a place, and what they print in each of them. */
interface Group extends Asked { texts: Set<string>[] }

const SIDES: readonly Side[] = ["front", "back"];
const DIGITS = [..."0123456789"];
/** How much wider than their sum two digits side by side can be, in parts of the size of the text, with the fonts of the engine. */
export const DIGIT_KERNING = 0.021;

/** The texts of one question at one place, with the names of their rectangles. Its number is not one of them. */
function printed(place: ItemPlace, asked: Asked, number: number): { name: string; ink: TextInk }[] {
  return itemRegions(place, { id: "", number, ...asked }, (name) => name)
    .filter((r) => r.role !== "label")
    .flatMap((r) => r.ink.flatMap((ink) => (ink.kind === "text" ? [{ name: r.id, ink }] : [])));
}

/** A text with each digit in the place of its digits. A number can have as many digits as the longest one of its question. */
function withEachDigit(text: string, longest: number): string[] {
  if (!/\d/.test(text)) return [text];
  const digits = /^\d+$/.test(text) ? "0".repeat(Math.max(text.length, longest)) : text;
  return DIGITS.map((d) => digits.replace(/\d/g, d));
}

/** A stack that fills its digit places in both lines: its widest question can have fewer digits in one line than another has. */
function fullest(face: Face, answer: Answer): Face {
  const places = needsOf(face, answer)["digit places"];
  return face.kind === "column" && places > face.sign.length ? { ...face, top: "0".repeat(places), bottom: "0".repeat(places - face.sign.length) } : face;
}

/** The questions of the row: all of them when the shape has a list, or the widest of each form with every digit. */
function groupsOf({ shape, limits }: SnapshotRow, template: PageTemplate, problems: string[]): Group[] {
  const listed = shape.list?.(limits).map((question): Asked => ({ face: shape.face(question), answer: shape.answer(question) }));
  const widest = formsOf(shape, limits).map(({ question, answer }): Asked => ({ face: fullest(shape.face(question), answer), answer }));
  const groups = new Map<string, Group>();
  for (const asked of listed ?? widest) {
    const problem = fitProblem(template, asked.face, asked.answer);
    if (problem) {
      if (problems.length === 0) problems.push(`the question ${questionText(asked.face, asked.answer)} ${problem}.`);
      continue;
    }
    const texts = printed(template.sides.front.places[0], asked, 1);
    const longest = needsOf(asked.face, asked.answer)["characters in a number"] ?? 0;
    const key = JSON.stringify(texts.map(({ ink }) => ink.rect));
    const group = groups.get(key) ?? { ...asked, texts: texts.map(() => new Set<string>()) };
    groups.set(key, group);
    texts.forEach(({ ink }, i) => {
      for (const text of listed ? [ink.text] : withEachDigit(ink.text, longest)) group.texts[i].add(text);
    });
  }
  return [...groups.values()];
}

export function rowTexts(row: SnapshotRow, template: PageTemplate): RowTexts {
  const problems: string[] = [];
  const texts: RowText[] = [];
  for (const group of groupsOf(row, template, problems)) {
    for (const side of SIDES) {
      template.sides[side].places.forEach((place, at) => {
        printed(place, group, at + 1).forEach(({ name, ink }, i) => {
          // The list has the texts themselves. A text that stands for others leaves room for what their digits add.
          const room = row.shape.list ? 0 : DIGIT_KERNING * ink.size;
          for (const text of group.texts[i]) texts.push({ side, name, ink: { ...ink, text, rect: { ...ink.rect, w: ink.rect.w - room * Math.max(0, text.length - 1) } } });
        });
      });
    }
  }
  return { texts, problems };
}
