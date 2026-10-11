// The grades 1-2 bank (#74): levels K-3 in the 3 strands grades 1-2 report (number, patterns and algebra,
// shapes, measurement and data; no fractions). A grade 1 test reaches K-2 and a grade 2 test reaches 1-3.
//
// Content: the curriculum map (.design/research/online-assessment/bc-math-curriculum-map.md), section 1 for the
// BC standards, section 3 for example items and section 4 for misconceptions. Formats follow the research on
// grades 1-2 (diagnostics-length-formats.md, section 3.3): at most 3 choices, typed answers of at most 2 digits up
// to level 2, short sentences, and read-aloud text with no symbols.
//
// Province grade tags (D-083). BC is the grade of the BC standard in `standard`. The others follow these rules:
// - SK and MB: the WNCP framework both build on (map, section 5). The map compares SK and MB only at the framework
//   level, so the WNCP grade is recalled, not checked against SK or MB documents.
// - AB: the same WNCP grade. The map gives outcome-level detail for the new AB program only for fractions, telling
//   time and multiplication facts, none of which this bank tests below level 3.
// - ON: the Ontario 2020 curriculum (map, section 5), recalled where the map gives no detail.
// - When a source is unsure, the later grade wins, so a child is never marked down for a topic their province may
//   not have taught yet. Topics WNCP teaches after grade 3 (likelihood, money, area) get WNCP's grade, so those
//   provinces never see them in a grades 1-2 test.
//
// whiteboard: true marks a question a child can show by drawing: dots, tally marks, a number line, tens and ones.
// Grades 1-2 draw only; they do not type their working (#67).
import type { TaggedTemplate } from "../kit";
import { LEVEL_K } from "./level-k";
import { LEVEL_1 } from "./level-1";
import { LEVEL_2 } from "./level-2";
import { LEVEL_3 } from "./level-3";

export const GRADE_1_2_BANK: readonly TaggedTemplate[] = [...LEVEL_K, ...LEVEL_1, ...LEVEL_2, ...LEVEL_3];
