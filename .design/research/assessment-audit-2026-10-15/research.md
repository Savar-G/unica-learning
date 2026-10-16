# Diagnostic assessment science for Unica Learning (grades 1-7, BC)

Compiled 2026-10-15. Confidence tags: [V] = read in this session from a primary or official page; [S] = secondary summary of a primary source, not read in full; [C] = my own calculation or design suggestion, not from a source; [K] = background knowledge, not re-verified; [U] = could not verify. Rule of thumb: do not quote an [S] or [U] number to a customer.

## 1. Items per skill, test length, and adaptive design

Items per skill for a mastery decision
- Model identification minimum: for the DINA diagnostic model, Gu and Xu show the model is identifiable only if the Q-matrix has an identity submatrix, each attribute is required by at least 3 items, and columns are distinct. This is a floor for estimating the model, not a guarantee of accurate classification. https://arxiv.org/abs/1711.03174 [V via abstract and R CDM docs]
- Classification accuracy rises when more items measure each attribute on its own (single-attribute items). Madison and Bradshaw (2015), Educational and Psychological Measurement 75:491-511; DeCarlo (2011). [S] https://journals.sagepub.com/doi/pdf/10.1177/0013164416645636 lists it
- Simulation guidance from a Monte Carlo study: test length of about 4x the number of attributes for linear/convergent hierarchies, 5-6x for divergent/unstructured/independent attributes, with a ceiling effect past that length. Acta Psychologica Sinica 48(12):1600 (2016). https://journal.psych.ac.cn/acps/EN/Y2016/V48/I12/1600 [S, abstract only; check full text]
- So "3 items per attribute" is the absolute minimum; 4-6 per attribute is the common simulation target. For 20 skills that is 80-120 item-skill pairs, which means items must load on 2+ skills or skills must be grouped.
- Stand-alone subscores from few items are weak. Haberman (2008) and Sinharay (2010): subscores based on fewer than about 10 items almost never add value over the total; about 20 items are needed for a subscore to be reliable enough to stand alone. https://www.ets.org/research/policy_research_reports/publications/report/2010/issf.html ; summary in https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.00305/full [S]. Implication: report a skill as a probability or category with uncertainty, pooled across related skills and prior knowledge, never as a raw "3 of 4".

Spearman-Brown and standard error [C, standard formulas, my arithmetic]
- Spearman-Brown: new reliability = n*r / (1 + (n-1)*r), where n = new length / old length.
- A skill scale of 4 items with reliability 0.50: 10 items gives 0.71, 20 items gives 0.83. Base 0.60: 10 items 0.79, 20 items 0.88.
- Worst-case standard error of a proportion-correct score (p = 0.5): 3 items 0.29 (95% half-width +/-0.57); 4 items 0.25 (+/-0.49); 5 items 0.22 (+/-0.44); 8 items 0.18 (+/-0.35); 10 items 0.16 (+/-0.31); 20 items 0.11 (+/-0.22). A 4-item skill score cannot separate "50%" from "75%".
- Mastery rule with slip 0.10 and guess 0.20 (5-option multiple choice): 3 of 3 correct passes 73% of true masters and 0.8% of non-masters; 2 of 3 passes 97% and 10%; 3 of 4 passes 95% and 2.7%; 4 of 5 passes 92% and 0.7%. Numeric entry (guess near 0) and independence of errors are the big assumptions; items sharing format share error, so real accuracy is lower. Use these as an upper bound.

Multistage adaptive testing (MST)
- Design: a routing module first, then easy/medium/hard modules based on score; adaptation at the module level, not the item level. https://bounadaptivetestlab.bogazici.edu.tr/node/335 [S]. Reference text: Yan, von Davier and Lewis (2014), Computerized Multistage Testing, CRC Press [U for chapter content].
- Trade-off: item-level CAT is usually slightly more precise at equal length; MST makes content balancing, expert review of every module, and item review easier. Kim (1993) found fixed-length CAT beat equal-length two-stage tests, but some two-stage configurations matched CAT. https://digitalcommons.unl.edu/dissertations/AAI9333973 [S, dissertation]
- Child-specific: I found no peer-reviewed study of MST routing accuracy for ages 6-10 [U]. Operational adaptive tests do run on young children: NWEA MAP Growth K-2 is item-level adaptive with 43 items (section 2). Math Garden (University of Amsterdam) uses an Elo model with items chosen near 75% success probability, and scores accuracy and response time together. Klinkenberg, Straatemeier and van der Maas (2011), Computers and Education 57:1813-1824. https://dare.uva.nl/id/67ab8977-5e36-4f9f-962d-be294f2b8c09 [S]
- Suggested shape for Unica [C]: Stage 1 routing, about 6-8 mixed-strand items at grade level (same for every child). Stage 2, one of three modules (below, at, above) of about 8-10 items. Stage 3, targeted probes of 8-10 items: prerequisites when the child misses a skill, extension when the child is secure. About 22-28 items total, split across 2-3 short sittings (section 3). Fixed modules keep every item reviewable by a human, which matters for a BC-aligned report.
- Target success rate of about 75% keeps children engaged (Math Garden design) but gives less information per item than 50%. A diagnostic should accept lower success on stage 3 probes only with a "not yet learned this" button, as IXL does.

## 2. Comparable K-8 diagnostics

| Product | Items | Time | Format and output | Confidence |
|---|---|---|---|---|
| NWEA MAP Growth math | Max 43 items (K-2, 2-5, 6+) since July 2022; 53 for 2-5 and 6+ before | Untimed. 2017-18 means (53-item era): K 22-36 min, Gr 1 29, Gr 2 39-41, Gr 3 48-52, Gr 4 53-57, Gr 5 58-63, Gr 6 62-68, Gr 7 64-70. 90th percentile Gr 3 about 73-81 min | Item-level adaptive CAT, RIT scale plus goal-area scores | [V] https://nwea.org/uploads/Average-MAP-Growth-Test-Durations.pdf |
| i-Ready Diagnostic math | Item count not published on pages I could read; a test-prep site says 60-90 [U] | Untimed; publisher says average 45 min per subject. District guidance (derived from vendor): K three 20-min sessions; Gr 1 two 20-30 min; Gr 2-5 two 40-50 min; Gr 6-8 two 45-50 min | Adaptive; domain-level placement, instructional next steps | [S] vendor FAQ 404 now; district pages e.g. https://www.jcschools.us/cms/lib/MO01909951/Centricity/Domain/54/iReady_Logging_K_8.pdf |
| IXL Real-Time Diagnostic | No fixed count | "About 45 minutes to 1 hour per subject" to pin levels, spread over sessions; then 10-15 questions per week to maintain | Level shown as a range that narrows (400 = ready for 4th grade, 450 = mid-year); "haven't learned this yet" skip; action plan of skill recommendations; no reliability claims on the page | [V] https://blog.ixl.com/?p=13249 |
| ALEKS initial assessment | About 30 questions [weak source] | 60-90 min (Kent State); under 1 hr for most (UCSB); 90-120 (UCSC) | Adaptive, builds a "knowledge space", reports topics the student is "ready to learn" | [S] https://airlift.sites.ucsc.edu/assessment-faqs |
| Khan Academy MAP Accelerator / course challenge | Not found | Not found | MAP Accelerator builds a path from MAP RIT scores; course challenge sampling count unconfirmed (forum says about 30) | [U] |
| Mathnasium assessment | Not published | One center: 1 to 1 hr 15 min; another: 60-90 min | In-center, one on one; output is a skill-by-skill learning plan containing only skills the assessment flagged; no score report described | [S] https://stage2.mathnasium.com/ca/how-it-works was 403; center pages via search |
| Kumon placement | Not found | Not found | Described as setting a starting point; no reliable primary source found | [U] |
| Beast Academy placement | Four printed unit tests per level (A-D, one per unit); problem count and minutes not found | "Ample time", quiet space; read aloud to younger students | Compare score to the recommended score printed on each test; move up or down a unit and retest. Levels by age: L1 6-8, L2 7-9, L3 8-10, L4 9-12, L5 10-13 | [V] https://help.beastacademy.com/a/1861864-how-to-determine-your-student-s-level |
| Eedi (diagnostic questions) | 5-question quizzes per "small step" in primary | Under 30 seconds per question is Barton's design aim | Single-answer multiple choice with three distractors, each mapped to a named misconception | [S] https://eedi.substack.com/p/what-do-4-million-students-responses |
| BC FSA numeracy (Gr 4, 7) | Online 30 selected-response + 3 written-response in a booklet | Online block 60 min; booklet 45 min (see bc-math-standards.md) | Emerging / On Track / Extending | [V] |

Read-across: mainstream adaptive screeners spend 40-70 minutes for a single scaled score. In-person tutoring centres spend about 60-90 minutes. Nobody publishes a verified per-skill reliability for their short forms. A 25-minute diagnostic for ages 6-8 and 35-45 minutes (two sittings) for ages 9-12 is shorter than all of these; the trade is lower precision per skill, so Unica should report coarse bands and flag low-confidence skills.

## 3. Attention and fatigue (ages 6-8 and 9-12)

What the evidence supports
- There is no experimentally derived "maximum minutes by age" for computer tests. Published session limits are practice guidance from vendors and states. The "2-3 minutes per year of age" folk rule has no primary source in this search [U].
- Vendor and state practice: i-Ready splits K into three 20-minute sessions, grade 1 into two 20-30 minute sessions, grades 2-5 into two 40-50 minute sessions [S, district pages above]. Nebraska NSCAS Growth (grades 3-8, about 90 min estimated) recommends two to three sessions within 5 days. https://www.education.ne.gov/wp-content/uploads/2025/12/2025-2026-NSCAS-Scheduling-Guidance.pdf [S]. NWEA 2017-18 median math test time: K 20-33 min, grade 1 about 27 min in fall [V].
- Within-test decline is real but varies. OECD PISA 2022: reading scores were 14 points lower for students who took reading in the second hour than the first (position and order effects mixed; age 15). https://www.oecd.org/en/publications/pisa-2022-results-volume-i_53f23881-en/full-report/how-much-effort-do-students-put-into-the-pisa-test_4a45c973.html [V via summary]. AIR found lower performance for items placed later on tests, contradicting some earlier evidence. https://air.org/resource/report/using-item-difficulty-and-item-position-measure-test-fatigue [S]. Size depends on subject, population and test design.
- Breaks help. Sievertsen, Gino and Piovesan (2016), PNAS 113:2621-2624, Danish national tests, 2,034,564 scores: each hour later in the day lowers performance by 0.9% of an SD; a 20-30 minute break raises it by 1.7% of an SD; lowest performers are affected most. https://pubmed.ncbi.nlm.nih.gov/26884183/ [V via abstract summary]. Pellegrini, Huberty and Jones (1995), AERJ 32:845-864: in grades K, 2 and 4, inattention rose with longer time since recess, and an indoor break also restored attention. [S]
- Vigilance decrement exists in young children (5-7 year olds slow down across a psychomotor vigilance task, with falling alertness), but the age slope within 6-12 is unclear and an older study found the "young decline, older do not" idea unsupported. https://asu.elsevierpure.com/en/publications/pupillometry-as-a-window-into-young-childrens-sustained-attention ; https://pmc.ncbi.nlm.nih.gov/articles/PMC4269577 [S]
- Rapid guessing is the visible fatigue signal. NWEA treats three successive rapid guesses as disengagement, alerts the proctor, and recommends retesting students who rapidly guess on at least 30% of items. https://nwea.org/blog/?p=24854 [V]

Design recommendation [C, not from a source]
- Ages 6-8 (grades 1-2): one sitting of 12-18 minutes of items, hard cap 20 minutes, 2 sittings if the child needs more; read-aloud audio for all stems; item count 10-14 per sitting.
- Ages 9-12 (grades 3-7): sittings of 20-25 minutes, hard cap 30; 2 sittings across 1-3 days; 14-18 items per sitting.
- Break design: after about 10 minutes or 8 items, a 30-60 second "stretch and reset" screen that also stores progress; offer "finish later" and resume without penalty; place the highest-value routing items first and the most tiring items (long word problems, multi-step) in the middle, not the end; end on a success-weighted item.
- Watch signals for stopping early: three consecutive rapid guesses, a run of skips, or a long idle gap. Stop and offer a break rather than recording a low score.

## 4. Response time as data

- Rapid guessing: Wise and Kong (2005) defined Response Time Effort as the proportion of responses that are not too fast to reflect real effort (RTE = 1 minus the proportion flagged), with thresholds set per item. https://rdrr.io/cran/aberrance/man/detect_rg.html [V via package docs]. The "10% of the item's mean time, capped at 10 seconds" rule is the normative threshold method (Wise and Ma, 2012, NCME paper) as described in secondary sources; a fixed 3-second cut for short items is also common but I could not confirm it in a primary source [U for exact numbers]. NWEA describes flags as "well below the average for that question" from its response-time repository. https://nwea.org/blog/?p=24854 [V]. Wise (2017), "Rapid-guessing behavior: Its identification, interpretation, and implications," is the review. [S]
- Rapid guesses should be dropped or modelled as missing, not scored as wrong, or ability is underestimated (effort-moderated scoring: Wise and DeMars 2006 [U, not read]).
- Math fact fluency: Baroody's working definition of mastery is a correct answer in about 3 seconds without counting. A Baroody-advised thesis (Bajwa) found the 3-second cutoff excludes counting but still lets through some overt reasoning, so it overestimates retrieval. https://www.ideals.illinois.edu/items/45535 [S]. Hasselbring and colleagues are cited for about 1 second as automatized; lab retrieval is 400-900 ms [S]. For a typed or tapped answer on a tablet, add a motor allowance; I suggest measuring each child's own baseline with a trivial item (tap the number 7) and subtracting it [C].
- Kamii comparison (secondary): a first-grade class built on number relationships met the 3-second goal for addition facts more often (about 76%) than a drill and flashcard class (about 55%). [S, via Bridges document https://bridges.mathlearningcenter.org/sites/default/files/documents/tla/tla-8devfluency.pdf]
- IES What Works Clearinghouse practice guide WWC 2021006, Recommendation 6: regular timed activities, usually 1-5 minutes, to build fluency; strong evidence (27 studies); goal is accurate answers in a short time, not just fast; students self-correcting before feedback may signal moving toward fluency. https://ies.ed.gov/ncee/WWC/Docs/PracticeGuide/WWC2021006-Math-PG.pdf [V]
- Speed-accuracy: Math Garden combines accuracy and response time in one Elo update so a fast correct answer counts more than a slow one, and a fast wrong answer costs more than a slow wrong one. Maris and van der Maas (2012) "Speed-accuracy response models: scoring rules based on response time and accuracy," Psychometrika 77:615-633 [U, not read].
- What time-on-item CAN tell you: disengagement (very short), retrieval vs counting vs reasoning for single-step facts (with caveats), relative item difficulty, and tiring (rising time with flat accuracy late in the test).
- What it CANNOT tell you: why a child was slow (reading load, motor input, careful strategy use, anxiety, a distraction); whether a fast right answer was retrieval or a lucky guess on multiple choice; math anxiety or "type of learner". Always normalize by item, by input mode and by the child's own baseline, and treat long times as ambiguous. Never flag a child as "slow" from a single session.

## 5. "How a child likes to learn"

- Learning styles (matching instruction to a visual/auditory/kinesthetic preference): Pashler, McDaniel, Rohrer and Bjork (2008), Psychological Science in the Public Interest 9:105-119. To support the meshing hypothesis, studies must assign learners by style, randomize to at least two methods, and give one common test, and show the best method differs by style. They found only one study giving even partial support and two that clearly contradicted it. https://digitalcommons.usf.edu/psy_facpub/1765/ [V via abstract]. Rogowsky, Calhoun and Tallal (2015, J. Educational Psychology 107:64) found no matching benefit in adults; a 2020 Frontiers replication with fifth graders found no link between style preference and comprehension. https://pmc.ncbi.nlm.nih.gov/articles/PMC7033468 [S]. Do not report or sell a "learning style".
- What should drive instruction, with evidence:
  - Systematic, incremental instruction building on prior knowledge, clear mathematical language, concrete and semi-concrete representations, number lines, deliberate word-problem instruction, and timed fluency work: all six recommendations rated strong evidence in WWC 2021006 (43, 16, 28, 14, 18, 27 studies). https://ies.ed.gov/ncee/WWC/Docs/PracticeGuide/WWC2021006-Math-PG.pdf [V]
  - Concrete-representational-abstract sequence: a 2025 meta-analysis of 30 single-case studies found a significant positive effect (Tau-BC about 0.99; not comparable to Cohen's d), and a review of special-education studies found positive effects in 16 of 17 studies meeting quality indicators. https://ideas.repec.org/a/taf/vjerxx/v118y2025i3p268-280.html [S; authors not confirmed]
  - Prior knowledge and misconceptions: whole-number and fraction knowledge develop in an integrated way, and early whole-number magnitude understanding predicts later fraction understanding (Siegler, Thompson and Schneider 2011, Cognitive Psychology). https://www.uni-trier.de/fileadmin/fb1/prof/PSY/PAE/Forschung/SieglerEtAl2011.pdf [V]
  - Working memory: Peng, Namkung, Barnes and Sun (2016), J. Educational Psychology 108:455-473, meta-analysis linking working memory and math. Practical use: reduce extraneous load in item design (short sentences, one visual, no split attention). [S, citation only]
  - Math anxiety: Barroso et al. (2021), Psychological Bulletin 147:134-168, 747 effect sizes, r = -0.28 between math anxiety and achievement (small to moderate). https://epic.tc.columbia.edu/research/academic-alert/blog-posts/the-relation-between-math-anxiety-and-math-achievement [S]. A 2026 Psychological Bulletin individual-participant study across 90 countries also exists. [U]
  - Motivation and interest: I did not verify a specific source in this session [U]. Use as a stated preference the parent or child gives (topics, themes), not as an inferred trait.
- Observable digital behaviours: which are valid signals?
  - Valid for reporting: accuracy by skill; which distractor was chosen (maps to a named error); numeric error patterns; response time relative to item norm; rapid-guess flags (an effort/validity flag, not a trait); "I haven't learned this yet" use (IXL pattern); self-correction; completion of the sitting.
  - Plausible but unvalidated, so label as "observations" and do not interpret: use of a drawing or ten-frame tool (shows strategy on that item, not a preferred style); hint requests; skips and retries; persistence on a hard item. Gaming-the-system behaviours in tutors are the best-studied case and are associated with reduced learning (Baker, Corbett and Koedinger 2004, ITS 2004 pp. 531-540) [S].
  - Invalid: inferring a "visual/auditory/kinesthetic learner", personality, or anxiety from clicks, speed or persistence; inferring ability from a rushed session.

## 6. Misconception catalogue (grades 1-7), with wrong-answer patterns

Sources for the catalogue: Brown and Burton (1978), Cognitive Science 2:155-192 (BUGGY, procedural subtraction bugs) [S]; Brown and VanLehn (1980) repair theory [S]; Steinle and Stacey Learning Decimals Project [V]; Falkner, Levi and Carpenter (1999) and McNeil and Alibali (2005, Child Development 76:883-899) on the equal sign [S]; Ni and Zhou (2005) whole number bias [S]; Eedi misconception-tagged distractors [V]; Ryan and Williams (2007), Children's Mathematics 4-15 [U, not read]; Fischbein (1985) [U]. Items marked [K] come from my background knowledge of the misconception literature; the wrong-answer arithmetic is checked, but I did not re-verify a source for each in this session.

Place value and whole numbers
- Face value vs place value (Gr 2-3): "What is the value of the 4 in 49?" Wrong: 4. Right: 40. [K]
- Zero as placeholder (Gr 3-5, BC Gr 3 names it): write "four hundred six" as 4006 or 400 6; write "sixty-five million three hundred thousand" as 65 300 000 correctly vs 65 000 300 000 when joining chunks. The FSA Gr 7 sample uses the last as a number-pad item. [K]; FSA [V])
- Reversal and teen numbers (Gr 1): 14 written as 41; 16 read as 61. [K]

Equal sign and number sentences (Gr 1-4)
- Operator view: 8 + 4 = _ + 5. Wrong: 12 (answer announced) or 17 (add everything). Right: 7. Many children from first to sixth grade give 12, 17, or 12 and 17. [S, Falkner et al. 1999]
- True/false: "5 + 3 = 8 + 0" judged false; "8 = 5 + 3" judged false or "backwards". [K]

Subtraction and regrouping (Gr 2-5)
- Smaller from larger in each column: 52 - 27 = 35 (right 25); 300 - 127 = 227 (right 173); also 63 - 28 = 45 (right 35). Eedi finds "subtracts the smallest number from the largest" across four constructs: two-digit mental subtraction, different-length integers, decimals with different numbers of places, and standard form. https://eedi.substack.com/p/what-do-4-million-students-responses [V]
- Borrowing across zero: 700 - 256 answered 556 (right 444); zero is treated as "nothing to borrow", so the child writes 6 - 0 = 6 and 5 - 0 = 5. [K, BUGGY family]
- Addition regrouping: 48 + 37 = 715 (writes both digits of 8 + 7) or 75 (drops the carry); right 85. [K]
- Treats "-" as "+": the Eedi mental-subtraction example lists this as a distractor. [V]

Multiplication and division (Gr 3-7)
- Partial products not shifted: 23 x 14 gives 92 + 23 = 115 (right 322). [K]
- "Multiplication makes bigger, division makes smaller" (Fischbein): 8 x 0.5 = 16 or "must be bigger than 8"; 6 / 0.5 = 3 (right 12). [K]; secondary mention that multiplying by a fraction can shrink a number, https://pmc.ncbi.nlm.nih.gov/articles/PMC5018237 [S])
- Division direction: 6 / 24 answered 4 ("divide big by small"). [K]
- Remainder as part of answer: 17 / 5 = 3 r 2 read as 3.2 (Gr 5, BC includes remainders). [K]
- Order of operations (Gr 6): 3 + 4 x 2 = 14 (left to right) vs 11. [K]

Fractions (BC Gr 3-6) and decimals (Gr 4-7)
- "Larger denominator is larger" (whole number bias): 1/8 > 1/4; 3/7 > 3/5. Ni and Zhou (2005). [S]. Related: compare 2/3 with 3/5 by picking the bigger numbers.
- Unequal parts counted as fractions: a shape cut into 3 unequal parts with one shaded read as 1/3. [K]; BC Gr 3 standard stresses equal-sized parts)
- Number line: counts tick marks instead of equal intervals (a 0-to-1 line with 3 interior ticks: the 2nd tick is read as 2/3 instead of 2/4). [K]
- Fraction-decimal link: 1/4 = 1.4 or 0.14 (digits side by side). [K]
- Decimals, from the Learning Decimals Project (3204 students, years 4-10, 30-item decimal comparison test): "Longer is larger" (0.35 > 0.4; 0.021 > 0.21) in 74% of Year 4, 46% Y5, 33% Y6, 17% Y7, 11% Y8, 5% Y9, 5% Y10; "Shorter is larger" 9%, 14%, 19%, 17%, 13%, 10%, 8%; task expert 4%, 24%, 31%, 48%, 60%, 65%, 70%. https://extranet.education.unimelb.edu.au/SME/TNMY/Decimals/Decimals/tests/incidenc.htm [V]. Sub-types with wrong-answer patterns https://extranet.education.unimelb.edu.au/SME/TNMY/Decimals/Decimals/tests/miscon.htm [V]: Whole number thinking (0.21 = 0.0021, 0.021 > 0.21); Reverse (0.35 > 0.41); Denominator-focused (0.4 > 0.83); Reciprocal (0.3 > 0.4, 0.12 > 0.3456); Negative (0.20 > 0.35); Money thinking (4.45 = 4.4502, nothing between 3.14 and 3.15). Use pairs designed so each misconception picks a different answer. Equalizing lengths with zeros is the correct strategy.
- Decimal addition by right alignment: 0.5 + 0.25 = 0.30. [K]
- Percent and integers (Gr 6-7): 25% of 80 computed as 80 / 25 = 3.2 (divides by the percent); -8 > -2 (larger magnitude is larger); -3 + -4 = 7 or 1. [K]

Measurement, geometry, data, probability
- Area vs perimeter (Gr 3-6): adds the sides when area is asked; A = l + w; belief that equal perimeters mean equal areas (BC Gr 5: "related to but not dependent on each other"). [K]
- Ruler: starts at 1 instead of 0 (adds 1); counts marks not intervals. [K]; BC Gr 1 stresses a baseline)
- Time: reads the hour hand near the next hour as the new hour (5:55 as 6:55); elapsed time across the hour by subtracting minutes only. [K]
- Graphs with a scale (BC Gr 4-5 many-to-one): reads each pictograph symbol as 1 when the key says 5; reads the bar scale by 1 when gridlines are 5. [K]
- Angles (Gr 6): reads the wrong scale on a protractor (supplement). [K]
- Probability (Gr 3-7): gambler's fallacy (after 4 heads, tails is "due"); equiprobability (two dice: every sum equally likely). [K]
- Patterns (Gr 4-7): recursive only ("add 2") and cannot find the 50th term; doubling the 10th term to get the 20th for a linear pattern (2n + 1: 21 becomes 42, right 41). [K]

Item design rule (Barton): it should not be possible to answer correctly while holding the misconception; each distractor maps to one named error; aim for under 30 seconds an item. [S via Eedi pages, https://eedi.com/articles/how-to-plan-for-error]

## 7. What a strong instructional diagnostic report contains

- Learning progression location: for each strand, where the child sits on a sequence of standards, not just a grade score. Clements and Sarama define a learning trajectory as three parts: a goal, a developmental progression of levels of thinking, and instructional tasks matched to each level. https://www.mheducation.com/prek-12/program/microsites/MKTSP-TMB03M02/program-details/program-foundations.html [S, publisher page]. Building Blocks cluster randomized trial: 42 schools, 1,375 preschoolers, g = 0.72 (JRME 2011). [S]
- Prerequisite structure: the Achieve the Core Coherence Map (Student Achievement Partners) shows prerequisite relations as arrows (an arrow from A to B means a student who cannot meet A probably cannot meet B) and related standards as dashed lines; each standard links to a task and solution. Use it as the model for "ready to learn next" and "prerequisite gap". https://achievethecore.org/coherence-map ; description in https://csaa.wested.org/resource/coherence-map-connecting-the-common-core-state-standards-for-mathematics/ [S]. Caveat from Colorado: it is a guide, not a complete diagnostic. Knowledge space theory (ALEKS) gives the same idea formally: topics a learner is "ready to learn" are those whose prerequisites are known. [S]
- Zone of proximal development / "ready to learn next": list standards whose prerequisites are secure but which are not yet secure, ordered by how many later standards they unlock. Do not label "ready" a standard whose prerequisites were not tested.
- Strengths: standards secure with at least 2 correct independent items, and fluency strengths; say so first.
- Error patterns: named misconceptions with the exact answer the child gave (distractor-to-misconception mapping like Eedi's ~36,000 distractors over ~12,000 questions and 4 million responses). Show 1-2 example items per pattern for a tutor.
- Fluency, separately from understanding: facts accuracy and speed (about 3 seconds for retrieval) reported apart from concept items, because a slow correct answer on a fact may still be reasoning.
- Evidence and confidence: items per skill, number of items skipped or rapidly guessed, and a plain "we are less sure" flag. Section 1 shows 3-5 items per skill cannot support precise claims.
- Recommended next steps by instruction type, tied to WWC 2021006: systematic review plus new content, concrete-to-semi-concrete representations, number lines for magnitude, word-problem structure, and 1-5 minute timed fluency sets on already-learned facts. [V]
- Teacher or tutor view and parent view: the tutor view lists standard codes, error patterns and prerequisites; the parent view translates to BC language (Emerging, On Track, Extending are the FSA categories parents already see) without a numeric grade-level claim.
- Limit to state in the report: BC's Curricular Competencies (reasoning, communicating, reflecting) are not measured by a short digital test.

## 8. Parent perception: effort, thoroughness, and drop-off

- Labor illusion: Buell and Norton (2011), Management Science 57:1564-1579. Across five experiments (travel search, online dating), showing the work being done raised perceived value and preference even when waiting longer for identical results; one summary reports value about 8% higher with transparency. https://pubsonline.informs.org/doi/references/10.1287/mnsc.1110.1376 [S]. It applies to visible effort by a system, not to making a child do more questions.
- Effort heuristic: Kruger, Wirtz, Van Boven and Altermatt (2004), "The effort heuristic," Journal of Experimental Social Psychology: more perceived effort led to higher quality judgments, strongest when quality is hard to judge. [S, abstract not read; page numbers not verified]. A 2023 preregistered replication (Collabra, N = 1,405) supported Experiment 2 but not Experiment 1 for some outcomes; Cho and Schwarz (2008) found the inference depends on a primed theory ("good work takes effort" vs "talent"). https://hub.hku.hk/handle/10722/348350 ; https://deepblue.lib.umich.edu/items/f5e6e3d7-57bd-483b-adcc-b10d2a62b8be [S]
- I found no study that measures parent perception of thoroughness or value versus the length of a children's diagnostic test [U]. The two effects are suggestive only. A safer reading: show the work (list the skills being checked, which standards, how the result was built) to get the "thorough" signal without adding minutes.
- Drop-off vs length: Galesic and Bosnjak (2009), Public Opinion Quarterly 73:349-360: announced length 10, 20 and 30 minutes gave start rates of 75%, 65% and 62%, and longer versions produced shorter open answers and more uniform answering late. https://ojs.ub.uni-konstanz.de/srm/article/view/8348/7667 for related work; paper DOI 10.1093/poq/nfp031 [S]. Vendor data (methodology not disclosed, treat as indicative): SurveyRock, 400,000 surveys, completion 97-99% up to 15 questions and 77% at 16-25 https://www.surveyrock.com/blog/survey-completion-rate-benchmarks ; SurveyMonkey via Koji, 89% at 10 questions to 79% at 40; RevenueHunt, product quizzes of 9-12 questions convert best. [U for rigour]
- None of this is about children: the child's own tolerance (section 3) and the parent's willingness to supervise are separate limits. Design for a first visit that can be finished in one 15-20 minute sitting by grades 1-2, with a clear "you can stop and resume" path, and measure drop-off per screen in PostHog from day one.

## Open items I could not verify
- Official item counts for i-Ready, Khan Academy challenge, Kumon, Beast Academy.
- Wise and Kong 2005 exact thresholds; Wise and DeMars 2006; Maris and van der Maas 2012.
- Child-specific MST evidence; direct evidence on parent perception of test length.
- Ministry plans for a K-9 math rewrite (none public as of 2026-10-15).
