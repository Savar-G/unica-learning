// The grades 3-5 bank (#75): levels 2-6 in the 4 strands grades 3-5 report (number and operations; fractions and
// decimals, from level 3; patterns and algebra; shapes, measurement and data). A grade 3 test reaches levels 2-4, a
// grade 4 test 3-5 and a grade 5 test 4-6.
//
// Levels 2 and 3 start with the grades 1-2 bank's templates (#74), the same objects, so a template has one id, one
// checker result and one set of tags. The new templates (ids "g35-<level>-...") are in level-3.ts to level-6.ts.
//
// Content: the curriculum map (.design/research/online-assessment/bc-math-curriculum-map.md), section 1 for the BC
// standards, section 3 for example items and section 4 for misconceptions. Formats follow the research on grades 3-5
// (diagnostics-length-formats.md, section 3.3): 4 choices by default, typed answers of at most 4 digits (bigger
// numbers are choices), and the number pad has no minus or fraction keys, so fractions and times are choices.
//
// Read-aloud: the test screen speaks the choices after the question (#79), so a template's read-aloud text never lists
// its choices. It says symbols as words: fractions ("3 eighths"), times ("4 35"), money ("13 dollars and 5 cents").
// No figures: a question that needs a picture describes it in words a child can follow without one.
//
// Province grade tags (D-083). BC is the grade of the BC standard in `standard`. The others:
// - SK and MB: the WNCP framework both build on (map, section 5), recalled where the map gives no outcome detail.
// - AB: the new K-6 program (map, section 5) where the map gives it: telling time in grade 3, and fractions from
//   grade 1. Elsewhere, the WNCP grade (the old AB program), recalled.
// - ON: the Ontario 2020 curriculum where the map gives it (telling time in grade 3, whole-number percents in grade
//   5); recalled elsewhere: decimal tenths in grade 4, hundredths in grade 5, thousandths in grade 6, and numbers to
//   100 000 in grade 5.
// - When a source is unsure, or the recalled grade is earlier than BC's and the map does not settle it, the later
//   grade wins, so a child is never marked down for a topic their province may not have taught yet. A template that
//   lands on a level outside 2-6 for a province is simply never asked there.
//
// whiteboard: true marks a question a child can show by drawing or writing: a column sum, a number line, a sketch of
// equal parts, a table. The core requires 7 of them on every route (#67); the bank test checks that every route has
// enough.
import { GRADE_1_2_BANK } from "../grades-1-2";
import type { TaggedTemplate } from "../kit";
import { LEVEL_3 } from "./level-3";
import { LEVEL_4 } from "./level-4";
import { keepOnOneLine } from "./say";

/** The grades 1-2 bank's level 2 and 3 templates (#74), reused as they are. */
const FROM_GRADES_1_2 = GRADE_1_2_BANK.filter((t) => t.grades.BC >= 2);

export const GRADE_3_5_BANK: readonly TaggedTemplate[] = [...FROM_GRADES_1_2, ...[...LEVEL_3, ...LEVEL_4].map(keepOnOneLine)];
