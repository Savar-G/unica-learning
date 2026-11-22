// Words a question may use only after the book has taught them (#1214): the term, the step that teaches it, and the plain
// definition printed in a "Words to know" strip when a question reaches the word first. Kept apart from the imported
// curriculum data. Today: the words of U10 and U19, the levels with a family. Everyday words are left out.
// Pure TypeScript: no network, database or clock.
import type { Intro } from "./workbook-page";

export interface Term {
  id: string;
  /** What in a question's text uses the word. */
  pattern: RegExp;
  /** The curriculum step whose page teaches it ("skill#step"). */
  taughtBy: string;
  /** The word as the strip prints it. */
  term: string;
  /** What it means, in plain words, with a tiny example. */
  meaning: string;
}

export const TERMS: readonly Term[] = [
  { id: "acute-obtuse", pattern: /\b(?:acute|obtuse)\b|\bright angles?\b/i, taughtBy: "6.13-classify-angles#1", term: "acute, right and obtuse angles",
    meaning: "Acute is smaller than a square corner. Right is a square corner. Obtuse is bigger than a square corner, under half a turn." },
  { id: "straight-reflex", pattern: /\breflex\b|\bstraight angles?\b/i, taughtBy: "6.13-classify-angles#2", term: "straight and reflex angles",
    meaning: "A straight angle is half a turn: a straight line. A reflex angle is more than half a turn and less than a full turn." },
  { id: "protractor", pattern: /\bprotractor\b/i, taughtBy: "6.13-measure-angles#2", term: "protractor",
    meaning: "It measures an angle in degrees. Put its middle on the corner and read where the other side crosses." },
  { id: "prime-composite", pattern: /\bprime\b|\bcomposite\b/i, taughtBy: "6.4-prime-composite#1", term: "prime and composite",
    meaning: "A prime number has only two factors: 1 and itself (7). A composite number has more (8 = 2 × 4)." },
  { id: "factor", pattern: /\bfactors?\b/i, taughtBy: "6.4-factors#1", term: "factor",
    meaning: "A factor divides a number with none left over. The factors of 12 are 1, 2, 3, 4, 6 and 12." },
  { id: "divisible", pattern: /\bdivisib/i, taughtBy: "6.4-divisibility#1", term: "divisible",
    meaning: "Divisible means it divides with none left over. 12 is divisible by 4 because 12 ÷ 4 = 3." },
  { id: "multiple", pattern: /\bmultiples?\b/i, taughtBy: "6.4-lcm#1", term: "multiple",
    meaning: "A multiple of 4 is a number you say when you count by 4s: 4, 8, 12, 16." },
  { id: "gcf", pattern: /\bgreatest common factor\b|\bGCF\b/i, taughtBy: "6.4-gcf#1", term: "greatest common factor (GCF)",
    meaning: "The biggest factor two numbers share. 12 and 18 share 1, 2, 3 and 6, so the GCF is 6." },
  { id: "lcm", pattern: /\bleast common multiple\b|\bLCM\b/i, taughtBy: "6.4-lcm#1", term: "least common multiple (LCM)",
    meaning: "The smallest number in both lists of multiples. Multiples of 4: 4, 8, 12. Of 6: 6, 12. The LCM is 12." },
  { id: "perimeter", pattern: /\bperimeter\b/i, taughtBy: "6.11-complex-perimeter#1", term: "perimeter",
    meaning: "The distance all the way around a shape. Add all its sides." },
  { id: "favourable", pattern: /\bfavourable\b/i, taughtBy: "6.18-theoretical#1", term: "favourable outcome",
    meaning: "A result you hope for. A spinner has 4 equal parts and 1 is red: 1 out of 4 is favourable for red." },
  { id: "theoretical", pattern: /\btheoretical\b/i, taughtBy: "6.18-theoretical#1", term: "theoretical probability",
    meaning: "What should happen when every outcome is equally likely: favourable outcomes out of all outcomes. 1 red part of 4 equal parts is 1 out of 4." },
  { id: "experimental", pattern: /\bexperimental\b/i, taughtBy: "6.18-experimental#1", term: "experimental probability",
    meaning: "What really happened in trials. Red 3 times in 10 spins is 3 out of 10." },
  { id: "fact-family", pattern: /\bfact famil(?:y|ies)\b/i, taughtBy: "3.4-subtraction-facts-20#1", term: "fact family",
    meaning: "The same three numbers: 3 + 4 = 7, 4 + 3 = 7, 7 − 3 = 4, 7 − 4 = 3." },
  { id: "near-double", pattern: /\bnear doubles?\b/i, taughtBy: "3.4-recall-addition-20#1", term: "near double",
    meaning: "A double plus or minus 1. 6 + 7 is the double 6 + 6, plus 1." },
];

/** The terms a text uses. */
export const termsIn = (text: string): Term[] => TERMS.filter((t) => t.pattern.test(text));

/** The "Words to know" strip of some terms. */
export const termsIntro = (terms: readonly Term[]): Intro => ({ kind: "terms", ids: terms.map((t) => t.id), terms: terms.map((t) => ({ term: t.term, meaning: t.meaning })) });
