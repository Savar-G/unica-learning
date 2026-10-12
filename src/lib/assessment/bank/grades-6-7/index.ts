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
// Province grade tags (D-083). BC is the grade of the BC standard in `standard`. The other tags were checked in the
// #75/#76 acceptance against the current official outcomes, saved 2026-10-11 (see README.md):
// - AB: the current K-6 program for grades K-6 content, and the 2016 K-9 program of studies (still current for grades
//   7-9) for grades 7-8 content.
// - SK: the CurriculumOutcomeContent pages for grades 1-8. MB: the framework pages for grades 1-8.
// - ON: the Ontario 2020 curriculum (January 2021 edition).
// - A tag is the earliest grade whose outcome covers the whole task: skill, number range and notation. Where an earlier
//   outcome covers only part of the task, or no outcome names it, the later grade stays, so a child is never marked
//   down for a topic their province may not have taught yet. The comment beside a changed tag cites its outcome, and
//   scripts/template-check/triage.md lists every checker flag with its disposition and source.
//
// whiteboard: true marks a question with working to show: a calculation, a diagram, a table. The session requires
// 10 of them on every route (#67).
import type { TaggedTemplate } from "../kit";
import { keepMathTogether } from "./helpers";
import { LEVEL_5 } from "./level-5";
import { LEVEL_6 } from "./level-6";
import { LEVEL_7 } from "./level-7";
import { LEVEL_8 } from "./level-8";

export const GRADE_6_7_BANK: readonly TaggedTemplate[] = [...LEVEL_5, ...LEVEL_6, ...LEVEL_7, ...LEVEL_8].map(keepMathTogether);
