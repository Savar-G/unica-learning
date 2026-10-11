// The grades 6-7 bank (#76): levels 5-8 in the 4 strands the report shows (number, fractions and decimals, patterns
// and algebra, shapes, measurement and data). A grade 6 test reaches levels 5-7 and a grade 7 test reaches 6-8.
//
// Content: the curriculum map (.design/research/online-assessment/bc-math-curriculum-map.md), section 1 for the BC
// standards, section 3 for example items and section 4 for misconceptions. Formats follow the research for grades
// 6-7 (diagnostics-length-formats.md, section 3.3): 4 choices where 4 make sense (3 where only 3 exist, such as
// "more, less or the same"), typed answers that the number pad can enter (digits and a decimal point; it has no minus
// key, so a negative answer is always a choice), and word problems in normal text.
//
// Read-aloud text says the question only. The test screen speaks the answer choices after it, in button order (#79),
// so a template never lists them. Symbols are said as words: "negative 3", "3 over 4", "25 percent", "3 to 5",
// "13 squared", "pi". No figures: a graph, a table or a shape is described in words that need no picture.
//
// Province grade tags (D-083). BC is the grade of the BC standard in `standard`. The others follow these rules:
// - SK and MB: the WNCP framework both build on (map, section 5), where the WNCP grade of the outcome is known
//   (recalled, as in the grades 1-2 bank). For example, WNCP compares integers in grade 6, adds them in grade 7 and
//   multiplies them in grade 8; it finds the area of triangles, parallelograms and circles in grade 7, and the mean
//   and median in grade 7.
// - AB: the same as SK and MB for grades 7-8 content (AB grades 7-9 still use the WNCP-based program, map section 5).
//   For grades 5-6 content the new AB K-6 program applies; the map settles only fractions: add and subtract with
//   common denominators in grade 5, multiply a fraction by a whole number in grade 6.
// - ON: the Ontario 2020 curriculum. The map settles whole-number percents (grade 5), adding and subtracting
//   fractions (like denominators grade 5, unlike grade 6) and integers (grade 6). Other ON grades are recalled.
// - When the map does not settle a grade and the recalled grade is unsure, the later grade wins, so a child is never
//   marked down for a topic their province may not have taught yet. The pull request for #76 lists these tags.
//
// whiteboard: true marks a question with working to show: a calculation, a diagram, a table. The session requires
// 10 of them on every route (#67).
import type { TaggedTemplate } from "../kit";
import { keepMathTogether } from "./helpers";
import { LEVEL_5 } from "./level-5";

export const GRADE_6_7_BANK: readonly TaggedTemplate[] = [...LEVEL_5].map(keepMathTogether);
