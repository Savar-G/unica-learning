import { questionWorkSpace } from "./workbook-work-space";
import { isWarmUpPage, printedInstruction, workbookWorkLine, workQuestionNumbers } from "@/lib/workbook-page-instructions";
// The workbook templates (#310, spec #296): one layout for every page type of .design/workbooks/DESIGN.md (section
// 7), with its tokens (section 1 to 4): the 8-page and 6-page days, Math in the world, the cover, How + Plan, the back
// cover with its level map, Friday 5, Show what you know, the level test, parent-led U1 to U3 pages, the early-level
// Remember these? pages and Challenge cards, every page with its footer (QR code, page ID, book page number,
// wordmark) and four scan marks. Blank pages pad the book at the end.
//
// A page's content comes as data (src/lib/workbook-page.ts): its header and its named slots, each with its questions.
// The template owns every position, size, colour and font. The title is one line of at most 4 words (D-201); a longer
// one fails the render. The day label and subtitle wrap to a second line at a word break; a third line, or a word wider
// than the column, fails the render (never cut). The type ramp is fixed per level band (U1 to U3, U4 to U9,
// U10 and up; DESIGN.md section 2); nothing is shrunk to fit. Its fit check (`fit`) fails a page whose content runs
// past the content area (naming the slot and the first question pushed out), a slot holding more items than it takes,
// an answer box smaller than the band allows, an answer box or choices over the question's own text, a work box under
// 44 px or writing lines closer than 36 px under their prompt and 34 px apart.
// Pure TypeScript: no Next.js, React, network, database or clock.
import { packageItem, PATTERN_SHAPES, valueText, type AnswerRegion, type AnswerValue, type QuestionPackage } from "@/lib/question-package";
import { dayLabel, type Block, type DayContent, type Figure, type PageContent, type SlotName, type WorkedLine } from "@/lib/workbook-page";
import {
  mark,
  regionNames,
  type DraftPage,
  type DraftQuestion,
  type FitProblem,
  type MeasuredElement,
  type PageParts,
  type WorkbookTemplate,
  type WorkbookDraft,
} from "@/lib/workbook-render";
import type { TemplateFonts } from "@/lib/workbook-template-fixed";
import { instructionProblem, feedbackItemProblem, generatedDayTime } from "@/lib/workbook-feedback-check";
import { titleProblem } from "@/lib/workbook-titles";
import { printedMinus, singularPlaces } from "@/lib/workbook-wording";
import { bottomGapLimit, layoutProblems } from "@/lib/workbook-layout-check";
import { printedWorkbookQuestion } from "@/lib/workbook-maya-operation";
import { curriculumFor } from "@/lib/workbook-curriculum";

/** A review page's title, as a child reads it: "Remember these?" prints "Review" (Savar, 2026-11-09). */
export const reviewTitle = (title: string) => title === "Remember these?" ? "Review" : title;
/** A plan row's second line, the same way: "Remember these?" and "Remember these? and a challenge". */
const reviewTopic = (topic: string) => topic.replace(/^Remember these\?/, "Review");

/**
 * Teaching data does not select a print layout or change a printed method. The printed instruction and title follow
 * the current rules on a stored book too (its content stays as stored): see printedInstruction and reviewTitle.
 */
function printedPage(page: DraftPage): DraftPage {
  const printed = { ...page, questions: page.questions.map(q => ({ ...q, package: printedWorkbookQuestion(q.package) })) };
  if (printed.content?.kind !== "day") return printed;
  const subtitle = printedInstruction(printed) ?? printed.content.subtitle, title = reviewTitle(printed.content.title);
  return subtitle === printed.content.subtitle && title === printed.content.title ? printed : { ...printed, content: { ...printed.content, subtitle, title } };
}

/**
 * Numbers of 1,000 and up print with commas, everywhere a page prints text (Savar, 2026-11-03, D-230, replacing the BC
 * spaces): 4,998, 97,531, 1,000,000. A number written in spaced groups ("10 000") is one number. The stored texts keep
 * plain digits, so every check reads them as before; a child may write either.
 */
export const commaNumbers = (t: string) => t
  .replace(/(?<![\d.,])(\d{1,3})((?:[ \u00a0\u202f]\d{3})+)(?![\d]|[.,]\d)/g, (_, a: string, rest: string) => a + rest.replace(/[ \u00a0\u202f]/g, ""))
  .replace(/(?<![\d.,:])\d{4,}(?![\d]|[,:]\d)/g, (n) => n.replace(/\B(?=(\d{3})+(?!\d))/g, ","));
const escape = (s: string) => commaNumbers(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fontFace = (family: string, weights: string, woff2: Uint8Array) =>
  `@font-face{font-family:"${family}";font-weight:${weights};src:url(data:font/woff2;base64,${Buffer.from(woff2).toString("base64")}) format("woff2")}`;

// ---------- Level bands ----------

/** The type ramp and box sizes of a level band (DESIGN.md section 2, minimum sizes by level; section 7.3). */
interface Band {
  consistentLayout?: boolean;
  /** The questions the page's work line already asks to show their work for ("Show your work under questions 1, 2
   * and 3."): their work spaces print no "Show your work" label of their own and are plain white (Savar's book 1 review). */
  instructed?: ReadonlySet<number>;
  /** A warm-up page: its instruction names no choice, so a circled choice prints its own "Circle one" (isWarmUpPage). */
  cueChoices?: boolean;
  name: "parent" | "early" | "mid";
  title: number;
  body: number;
  /** Labels, chips, notes and grid numbers: never under the band's minimum child-facing size. */
  small: number;
  fact: number;
  math: number;
  column: number;
  number: number;
  story: number;
  /** The answer box height. */
  box: number;
}

const BANDS: Record<Band["name"], Band> = {
  // U10 and up: the reference sizes.
  mid: { name: "mid", title: 30, body: 15, small: 13, fact: 17, math: 15, column: 22, number: 14, story: 15, box: 48 },
  // U4 to U9: 18 px at least; bigger maths in facts (30 to 34).
  early: { name: "early", title: 36, body: 20, small: 18, fact: 30, math: 20, column: 28, number: 18, story: 20, box: 56 },
  // U1 to U3: 20 px body, boxes at least 56.
  parent: { name: "parent", title: 36, body: 20, small: 18, fact: 32, math: 22, column: 30, number: 18, story: 20, box: 56 },
};
export const bandOf = (level: number): Band => BANDS[level <= 3 ? "parent" : level <= 9 ? "early" : "mid"];

/** Writing lines: the first at least 36 px under its prompt, the next at least 34 px under it (DESIGN.md section 4). */
const LINE_FIRST = 36;
const LINE_NEXT = 34;
const LINES = 2;
/** The most lines a card's question text takes (D-201: a story card's 3 full sentences). */
export const CARD_LINES = 3;
/** The smallest work box: the inline Mixed set box. */
const WORK_MIN = 64;
/** The smallest answer box each way at any level (CONTEXT.md section 6). */
export const ANSWER_MIN = 40;
export const workMinimum = (level: number) => level <= 9 ? 120 : level <= 18 ? 140 : 160;
export const questionNumber = (number: number): string => `${number}.`;

// ---------- Slot limits (DESIGN.md section 7: maximums for the 688 by 720 content area) ----------

/** The most items a slot takes on a page. */
export function slotMax(slot: SlotName, c: Pick<DayContent, "level" | "pages" | "consistentLayout"> & { extraPractice?: boolean }): number {
  const band = bandOf(c.level);
  switch (slot) {
    case "warm-up": return band.name === "mid" ? 12 : 8;
    case "fix-it": return 3;
    case "in-your-head": case "try-first": case "spot-the-error": case "solve-it-two-ways": case "how-do-you-know": return 1;
    // Short template questions fill a review page in two columns of 7 (#489); the measured fit and the day's minutes cap it.
    case "remember-these": return band.name === "parent" ? 6 : c.consistentLayout ? 24 : 8;
    case "now-you": return c.consistentLayout && c.level !== 16 ? 5 : 4;
    case "finish-these": return c.consistentLayout ? 4 : 2;
    case "on-your-own": return c.consistentLayout ? 24 : band.name === "mid" ? 8 : 6;
    case "practice-row": return c.consistentLayout ? 24 : 4;
    case "word-problems": return c.consistentLayout ? 4 : 3;
    case "unit-b-practice": return c.consistentLayout ? 24 : 8;
    case "mixed-set": return 4;
    case "picture-stories": return 6;
    case "friday-5": return 5;
    case "challenge": return c.consistentLayout ? 3 : 2;
    case "math-in-the-world": return 3;
    // Cards with a work area of at least 44 px: 5 rows of 2 from U10, 4 rows at U4 to U9.
    case "show-what-you-know": return band.name === "mid" ? 8 : 6;
    case "level-test": return band.name === "mid" ? 8 : 6;
    case "unit-check": return 4;
    case "mini-test": return 5;
    case "already-know-it": return 10;
    case "worked-example": case "watch-one": case "reminder": return 0;
  }
}

// ---------- Text room (what the generator tells the AI, #380) ----------

/**
 * The room a question's text has in a slot: the most characters, in at most `lines` lines of `perLine` characters.
 * The generator gives it to the AI for each item, so the AI writes text the page has room for; the fit check still
 * measures the real page. On a card, writing lines (a written reason) or a tall picture (a number line, base-ten
 * blocks) take the place of a line of text.
 */
export interface TextRoom {
  characters: number;
  lines: number;
  perLine: number;
}

/** The content area's width (.frame). */
const CONTENT_W = 688;
/** Geist's average letter is about half its size wide; Geist Mono's 0.6. */
const SANS_EM = 0.5;
const MONO_EM = 0.6;
/** A word that does not fit at a line's end starts the next one: count 90% of the letters a line holds. */
const WRAP = 0.9;

const textRoomOf = (width: number, font: number, lines: number, em = SANS_EM): TextRoom => {
  const perLine = Math.floor(width / (font * em));
  return { characters: Math.floor(perLine * lines * WRAP), lines, perLine };
};

/**
 * A slot's text room at a level, from the template's own widths and type sizes (the CSS below):
 * - a card of two (.pcard, every item of a parent-led page, picture stories at every level): half the content width
 *   less the card's border and padding and its number badge: 268 px at U1 to U9, for 3 lines (D-201: a story in
 *   full sentences). A card the child circles on also has a pencil (38 px), which the fit check measures;
 * - a line in a list (.list): the full width less the number, the gaps and an answer box: 1 line;
 * - a line in a grid of two (.two): half of that: 1 line;
 * - Spot the error: the sum beside Is it right? and the fix box: about 160 px of Geist Mono at U1 to U9 (no "Tick
 *   one" hint there), the sum only (5 + 3 = ?); about 150 px from U10, 2 lines;
 * - a warm-up fact (.facts, Geist Mono, one line that never wraps);
 * - stories, How do you know?, the Mixed set, Challenge, Math in the world, Solve it two ways and test cards by their
 *   own blocks. Null for a panel (no question).
 */
export function textRoom(slot: SlotName, level: number, pages = 8, consistent = false): TextRoom | null {
  const band = bandOf(level);
  const six = pages <= 6 && band.name === "mid";
  const parent = band.name === "parent";
  const badge = band.name === "mid" ? 24 : 30;
  const box = Math.max(64, band.box);
  // .pcard: (688 - 12) / 2, less its border (2) and padding (28), badge and one 10 px gap (no read-aloud mark, D-201).
  const cardWidth = (CONTENT_W - (consistent ? 32 : 12)) / 2 - 2 - 28 - badge - 10;
  const card = textRoomOf(cardWidth, band.body, CARD_LINES);
  // .list: the number (22) and three 12 px gaps around the text and the box.
  const full = textRoomOf(CONTENT_W - 22 - 36 - box, band.body, 1);
  // .two: (688 - 32) / 2, the same.
  const half = textRoomOf((CONTENT_W - 32) / 2 - 22 - 36 - box, band.body, 1);
  const list = (many: boolean) => (parent ? card : many ? half : full);
  switch (slot) {
    case "worked-example": case "watch-one": case "reminder": return null;
    case "warm-up": {
      // A fact grid of 3 (2 at U1 to U9) in Geist Mono: the grey number (22), the box and two gaps of 10.
      const cols = band.name === "mid" ? 3 : 2;
      const gap = band.name === "mid" ? 24 : 48;
      return textRoomOf((CONTENT_W - gap * (cols - 1)) / cols - 22 - 20 - band.box, band.fact, 1, MONO_EM);
    }
    case "spot-the-error":
      // U1 to U9: its own line in the outlined box, the strip and the fix box under it. From U10: about 150 px beside them.
      return band.name === "mid" ? textRoomOf(150, band.body, 2) : textRoomOf(160, band.math, 1, MONO_EM);
    case "fix-it":
      // Three cards in a panel (U4 and up): (688 - 44 - 24) / 3 less padding, badge and gap; the box wraps under.
      return parent ? card : textRoomOf((CONTENT_W - 44 - 24) / 3 - 28 - badge - 12, band.body, 2);
    case "in-your-head": case "try-first": case "now-you": case "how-do-you-know":
      // A panel or outlined box around a full-width line: 40 px of padding less. How do you know? has one line.
      return parent && slot === "now-you" ? card : textRoomOf(CONTENT_W - 40 - 22 - 36 - box, band.body, 1);
    case "remember-these": return list(true);
    case "finish-these": case "on-your-own": return list(six);
    case "practice-row": return list(true);
    case "unit-b-practice": return list(true);
    case "friday-5": case "unit-check": case "mini-test": case "already-know-it": return list(true);
    case "picture-stories": return card;
    case "show-what-you-know": case "level-test":
      // Test cards, two to a row: half the width less padding, badge, gaps and the box; the work area grows.
      return parent ? card : textRoomOf((CONTENT_W - 16) / 2 - 28 - badge - 24 - box, band.body, 2);
    case "solve-it-two-ways":
      // Beside the number and the "Solve it two ways" label (17 letters of Geist Mono).
      return textRoomOf(CONTENT_W - 22 - 24 - 17 * band.small * MONO_EM, band.body, 2);
    case "word-problems":
      // A story's full line beside its number (26 + 12) and a picture.
      return textRoomOf(CONTENT_W - 38 - 160, band.story, 3);
    case "mixed-set":
      return textRoomOf((consistent ? (CONTENT_W - 32) / 2 : CONTENT_W) - 22 - 12, band.name === "mid" ? 14 : band.story, 2);
    case "challenge":
      return textRoomOf(CONTENT_W - 35 - badge - 32 - box, band.body, 4);
    case "math-in-the-world":
      return textRoomOf(CONTENT_W - 22 - 36 - box, band.body, 2);
  }
}

// ---------- Colours ----------

type Family = "wu" | "pr" | "ni" | "wp" | "rv" | "ch" | "lt";

/** Each page type's colour family (DESIGN.md section 3). The level test is not in the table: ink. */
const FAMILY: Record<string, Family> = {
  "warm-up": "wu", practice: "pr", "practice-2": "pr", "new-idea": "ni", "unit-b": "ni", "word-problems": "wp",
  "math-in-the-world": "wp", "remember-these": "rv", "remember-these-mixed-set": "rv", "friday-5": "rv",
  "show-what-you-know": "rv", challenge: "ch", "level-test": "lt",
};
/** A parent-led page takes the family of its first slot. */
const SLOT_FAMILY: Partial<Record<SlotName, Family>> = {
  "warm-up": "wu", "fix-it": "wu", "in-your-head": "wu", "worked-example": "ni", "try-first": "ni", "now-you": "ni",
  "watch-one": "pr", "finish-these": "pr", "on-your-own": "pr", "practice-row": "pr", "unit-b-practice": "ni", reminder: "ni",
  "word-problems": "wp", "picture-stories": "wp", "math-in-the-world": "wp", challenge: "ch", "level-test": "lt",
};
const familyOf = (page: DraftPage, c: DayContent): Family =>
  page.type === "parent-led" ? (SLOT_FAMILY[c.blocks[0]?.slot] ?? "rv") : (FAMILY[page.type] ?? "rv");

// ---------- Style sheet ----------

const CSS = `
*{box-sizing:border-box}
.pg{position:absolute;inset:0;font-family:"Unica Sans",Helvetica,Arial,sans-serif;color:#0C0C0E;font-size:var(--body);line-height:1.4}
.pg.mid{--title:30px;--body:15px;--small:13px;--fact:17px;--math:15px;--col:22px;--num:14px;--story:15px;--box:48px}
.pg.early{--title:36px;--body:20px;--small:18px;--fact:30px;--math:20px;--col:28px;--num:18px;--story:20px;--box:56px}
.pg.parent{--title:36px;--body:20px;--small:18px;--fact:32px;--math:22px;--col:30px;--num:18px;--story:20px;--box:56px}
.mono{font-family:"Unica Mono",ui-monospace,Menlo,monospace}
.scan{position:absolute;width:18px;height:18px;border:0 solid #111111}
.scan.tl{left:22px;top:22px;border-left-width:3px;border-top-width:3px}
.scan.tr{right:22px;top:22px;border-right-width:3px;border-top-width:3px}
.scan.bl{left:22px;bottom:22px;border-left-width:3px;border-bottom-width:3px}
.scan.br{right:22px;bottom:22px;border-right-width:3px;border-bottom-width:3px}
.frame{position:absolute;left:64px;top:64px;width:688px;height:866px;display:flex;flex-direction:column;gap:20px}
.frame>*{flex-shrink:0}
.hd{display:flex;flex-direction:column;gap:8px}
.pg.mid .hd{min-height:126px}
.nd{margin-bottom:18px;display:flex;align-items:flex-end;gap:8px;height:18px;font-size:13px;line-height:18px}
.nd .r1{display:block;width:483px;border-bottom:1px solid #0C0C0E;height:14px}
.nd .r2{display:block;flex:1;border-bottom:1px solid #0C0C0E;height:14px}
.dl{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:var(--small);line-height:1.2;letter-spacing:.04em;text-transform:uppercase;max-height:calc(var(--small)*2.4);overflow:hidden}
.tt{margin:2px 0 0;font-weight:300;font-size:var(--title);line-height:1.25;padding-bottom:2px;white-space:nowrap;overflow:hidden}
.st{white-space:nowrap;margin:0;font-size:var(--body);color:#44444C;max-height:calc(var(--body)*1.4);overflow:hidden}
/* The work line: its own line under the instruction, bold on the cover's yellow highlight (Savar, 2026-11-09). */
.sw{white-space:nowrap;margin:0;font-size:var(--body);line-height:1.25;color:#0C0C0E;max-height:calc(var(--body)*1.25);overflow:hidden}
.sw b{display:inline-block;max-width:100%;overflow:hidden;vertical-align:top;font-weight:600;background:#FFD23F;padding:0 6px}
/* A header with the work line keeps the page's content room: its lines sit 2 px closer, the work line 1.25 high. */
.hd:has(.sw){gap:6px}
.pg.consistent .hd:has(.sw){max-height:none}
.gu{margin:0;font-size:var(--body);color:#0C0C0E;background:#F4F4F5;border-radius:8px;padding:6px 12px;overflow:hidden}
.gu b{font-weight:500}
.ct{flex:1 1 auto;flex-shrink:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:12px}
.ct>*{flex-shrink:0}
.blk{display:flex;flex:1 0 auto;flex-direction:column;gap:8px}
.blk.grow{flex-grow:1}
.blk.optional-block{border:1px solid #5A4300;border-radius:2px;padding-left:4px}
.ft{position:absolute;left:64px;top:950px;width:688px;height:58px;display:flex;align-items:center;gap:12px}
.ft [data-measure="qr"]{width:58px;height:58px;flex:none}
.ft svg{width:58px;height:58px;display:block}
.ft .ids{display:flex;flex-direction:column;gap:3px;font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:11px;line-height:1.2}
.ft .pn{color:#44444C}
.wm{margin-left:auto;font-weight:500;font-size:14px;display:flex;align-items:flex-end;gap:2px}
.wm i{display:block;width:4px;height:4px;background:#FF6A3D;margin-bottom:3px}
/* families: day label, chip, panels */
.f-wu .dl{color:#064E32}.f-pr .dl{color:#0B7A4F}.f-ni .dl{color:#2453D4}.f-wp .dl{color:#C2410C}.f-rv .dl{color:#8A6500}.f-ch .dl{color:#2B2622}.f-lt .dl{color:#0C0C0E}
.chiprow{display:flex;align-items:center;gap:10px}
.chiprow .side{flex:1 1 auto;min-width:0}
.chip{flex:none;display:inline-flex;align-items:center;gap:8px;height:28px;padding:6px 10px;border-radius:999px;font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:var(--small);line-height:1.2;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
.pg.early .chip,.pg.parent .chip{height:34px}
.chip svg{width:16px;height:16px;flex:none}
.chip.c-wu,.chip.c-pr{background:#E3F5EC;color:#064E32}
.chip.c-ni{background:#EAF0FF;color:#1B3FA6}
.chip.c-wp{background:#FFEDE5;color:#7C2D12}
.chip.c-mx{background:#FFD23F;color:#0C0C0E}
.chip.c-rv{background:#FFF6D6;color:#5A4300}
.chip.c-ch{background:#FFF0B8;color:#0C0C0E;border:1.5px solid #2B2622;height:31px}
.chip.c-fx{background:#FDECEC;color:#B42318}
.chip.c-lt{background:#F4F4F5;color:#0C0C0E}
.pg .chip.c-extra-inline{height:auto;padding:0 8px;vertical-align:top;margin-left:10px}
.side{font-size:var(--small);color:#44444C}
.lab{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:var(--small);line-height:1.2;letter-spacing:.04em;text-transform:uppercase;color:#44444C}
.blue{color:#2453D4}
.n{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:var(--num);line-height:1.2;min-width:22px;flex:none}
.qt{font-size:var(--body)}
.qm{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:var(--math);white-space:nowrap}
/* answer regions */
.ab{display:inline-block;height:var(--box);min-width:var(--box);border:1.2px solid #0C0C0E;border-radius:6px;background:#fff;flex:none;vertical-align:middle}
.rg{display:inline-flex;align-items:center;gap:8px;flex:0 1 auto;flex-wrap:wrap;max-width:100%}
.rg .rl{font-size:var(--small);color:#44444C}
.rg .rl.box{font-family:"Unica Mono",ui-monospace,Menlo,monospace;letter-spacing:.04em;text-transform:uppercase}
.unit{font-size:var(--body)}
.strip{display:inline-flex;align-items:center;gap:28px;min-height:42px;padding:8px 14px;background:#F4F4F5;border-radius:8px;flex:0 1 auto;flex-wrap:wrap;max-width:100%}
.pg.early .strip,.pg.parent .strip{min-height:56px}
.strip .ch{display:inline-flex;align-items:center;gap:8px;font-size:16px}
.pg.early .strip .ch,.pg.parent .strip .ch{font-size:var(--body)}
.tb{display:inline-block;width:20px;height:20px;border:2px solid #0C0C0E;border-radius:3px;background:#fff}
.pg.early .tb,.pg.parent .tb{width:26px;height:26px}
.t1{display:inline-flex;align-items:center;gap:6px;font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:13px;color:#44444C;flex:none}
.pg.early .t1,.pg.parent .t1{font-size:var(--small)}
.t1 i{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:1.5px solid #0C0C0E;border-radius:2px;font-style:normal;font-size:12px;color:#0C0C0E;line-height:1}
.circ{display:inline-flex;align-items:center;gap:36px;min-height:56px;padding:6px 18px;flex:none}
.circ .co{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:var(--fact)}
.circ.words{flex-direction:column;align-items:flex-start;gap:4px;min-height:48px;min-width:56px;padding:2px 8px}
.circ.words.likelihood{flex-direction:row;gap:16px}
.circ.words .co{font-family:"Unica Sans",Helvetica,Arial,sans-serif;font-size:var(--body);line-height:1.3;white-space:nowrap}
.wb{display:block;border:0;border-radius:0;padding:0;background:transparent;flex:1 1 auto;min-width:120px}
.wb .lab{font-weight:400;color:#44444C}
.ln{display:block;width:100%}
.ln .lp{font-size:var(--body);height:calc(var(--body)*1.4)}
.ln i{display:block;border-bottom:1px solid #9A9AA2;height:${LINE_NEXT}px}
.ln i:first-of-type{height:${LINE_FIRST}px}
.pic{display:block;flex:none}
.seq{display:inline-flex;align-items:center;flex-wrap:wrap;gap:6px 8px}
.obx{display:inline-flex;align-items:center;flex-wrap:nowrap;gap:8px;flex:none}
.picr{display:inline-block;flex:none}
.nl{position:relative;flex:none}
.nlv{position:absolute;transform:translateX(-50%);font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:14px;line-height:1}
.draw{display:block;width:100%;height:140px;border:1px dashed #CCCCD1;border-radius:8px}
/* items */
.q{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.q .qb{flex:1 1 0;min-width:min-content}
.q .rgs{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.q .full{flex-basis:100%;display:flex;gap:12px}
.work-space{width:100%;background:#fff;flex:1 0 auto}
.list{display:flex;flex:1;flex-direction:column;justify-content:space-evenly;gap:10px}
.two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:32px;row-gap:12px;align-items:stretch;flex:1;grid-auto-rows:1fr}
.two>.q{align-content:start;align-items:start}.two>.q>.n{padding-top:12px}.two>.q>.qb{padding-top:8px}
.facts{flex:1;align-content:space-between;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:24px;row-gap:12px}
.pg.early .facts,.pg.parent .facts{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:48px;row-gap:22px}
.facts .q{gap:10px;flex-wrap:nowrap}
.facts .gn{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:var(--small);color:#44444C;min-width:22px;flex:none}
.facts .qm{font-size:var(--fact);flex:1 1 auto;white-space:nowrap}
.cols{flex:1;align-content:space-between;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 16px}
.col{display:flex;gap:10px;align-items:flex-start}
.col .sum{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:var(--col);line-height:1.12;text-align:right;min-width:96px;display:flex;flex-direction:column;align-items:flex-end}
.col .sum .rule{width:100%;border-top:2px solid #0C0C0E;margin-top:3px;padding-top:4px;display:flex;justify-content:flex-end}
.col .sum .op{margin-right:auto;padding-right:8px}
.col .sum .row{display:flex;width:100%;justify-content:flex-end}
.card{border:1px solid #D4D4DA;border-radius:10px;padding:16px;background:#fff}
.badge{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#F1F1F4;font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:13px;line-height:1;flex:none}
.pg.early .badge,.pg.parent .badge{width:30px;height:30px;font-size:var(--small)}
.panel{border-radius:12px;padding:16px 22px}
.p-ni{background:#EAF0FF}.p-ni .lab{color:#1B3FA6}
.p-pr{background:#E3F5EC}.p-pr .lab{color:#064E32}
.p-rv{background:#FFF6D6;border-radius:16px}.p-rv .lab{color:#5A4300}
.p-fx{background:#FDECEC}.p-hd{background:#F1F1F4;border-radius:10px}
.wo{font-size:.85em;color:#5F5F6B}.note-mm{font-size:.85em;color:#5F5F6B;margin-top:4px}
.outl{border:1.5px solid #3366F0;border-radius:12px;padding:12px 20px 12px;background:#fff;display:flex;flex-direction:column;gap:8px}
.outl .lab{color:#1B3FA6}
.wk{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:var(--math);line-height:1.5}
.ways{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.ways .in{background:#fff;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.fig2{display:flex;gap:26px;align-items:flex-start}
.fig2 .why{flex:1 1 0;display:flex;flex-direction:column;gap:6px}
.inner{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:10px}
.inner .card{border:none;border-radius:12px;display:flex;flex-direction:column;gap:10px;padding:12px 14px}
.story{display:flex;flex-direction:column;gap:8px;padding-top:10px;border-top:1.5px solid #FF6A3D}
.story .sn{font-weight:300;font-size:26px;line-height:1;min-width:26px}
.story .head{display:flex;gap:12px;align-items:flex-start}
.story .qt{font-size:16px}
.pg.early .story .qt,.pg.parent .story .qt{font-size:var(--story)}
.story .act{display:flex;gap:16px;align-items:flex-end}
.story .act .wb{height:110px}
.mxs{display:flex;flex-direction:column;gap:6px}
.mx{display:flex;flex-direction:column;gap:2px;padding-top:6px;border-top:1px solid #D4D4DA}
.mx .qt{font-size:14px;line-height:1.3}
.mx .strip{height:40px;gap:20px}
.pg.early .mx .qt{font-size:var(--story)}
.mx .stp{display:flex;align-items:center;gap:12px}
.mx .sb{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#0C0C0E;color:#fff;font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:13px;line-height:1;flex:none}
.mx .sl{font-size:var(--body);min-width:150px}
.mx .wb{height:64px;display:flex;align-items:center}
.chs{display:flex;flex-direction:column;gap:16px;flex:1 1 auto}
.chs>*{flex:1 1 0}
.chs.side2{flex-direction:row}
.chs.side2>*{flex:1 1 0}
.chc{background:#F4F2F0;border:1.5px solid #2B2622;border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px}
.chc .top{display:flex;gap:16px;align-items:flex-start}
.chc .top .qb{flex:1 1 0}
.chc .wb{display:block;flex:1 1 auto;min-height:120px}
.fill{flex:1 1 auto;display:grid;gap:12px 16px;grid-auto-rows:minmax(0,1fr)}
.tc{border:1px solid #D4D4DA;border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-height:0}
.tc .wb{display:block;flex:1 1 auto;min-height:${WORK_MIN}px}
.pcards.fill{grid-template-columns:repeat(2,minmax(0,1fr))}
.pcards.fill .pcard .pb{flex:1 1 auto;align-items:center}
.tw{display:flex;flex-direction:column;gap:10px}
.tw .ways2{display:flex;gap:14px;align-items:flex-end}
.tw .ways2 .wb{height:84px}
.info{display:flex;gap:12px}
.info .ic{flex:1 1 0;background:#FFEDE5;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:4px}
.info .ic .lab{color:#7A2E0E}
.info .ic .v{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:var(--math)}
.parts{display:flex;flex-direction:column;gap:10px}
.parts .rg{width:100%;justify-content:space-between}
.pcards{flex:1;grid-auto-rows:1fr;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.pcard{border:1px solid #D4D4DA;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.pcard .pb{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}
.pcard .pb>.pic{max-width:60%;height:auto}
.pcard .draw{height:56px;width:150px}
.pcard .ln{min-width:160px}
.pcard .head{display:flex;gap:10px;align-items:flex-start}
.pcard .ico{width:28px;height:28px;flex:none}
/* cover */
.cv{position:absolute;left:64px;top:64px;width:688px;height:866px;display:flex;flex-direction:column;overflow:hidden}
.cv .top{display:flex;justify-content:space-between;align-items:center}
.cv .top .wm{margin:0;font-size:22px}
.cv .top .wm i{width:6px;height:6px;margin-bottom:5px}
.cv .wn{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:13px;letter-spacing:.04em;color:#44444C}
.mk{display:grid;grid-template-columns:repeat(3,36px);margin-top:56px}
.mk i{display:block;width:36px;height:36px;border:1.2px solid #0C0C0E;margin:0 -1.2px -1.2px 0;background:#fff}
.mk .y{background:#FFD23F}.mk .b{background:#3366F0}.mk .o{background:#FF6A3D}.mk .g{background:#16A06A}
.cv .for{margin-top:32px;font-weight:500;font-size:22px;line-height:1.4;color:#44444C;max-height:62px;overflow:hidden}
.cv h1{margin:20px 0 0;font-weight:300;font-size:66px;line-height:1.18;letter-spacing:-.03em;height:164px;overflow:hidden}
.cv h1 .hl{display:inline-block;background:#FFD23F;padding:0 10px;margin-left:-10px;line-height:1.12}
/* The two cover cards (variant D): identical white cards with a dark outline, the sentence and the plan's topics. */
.cv .card{margin-top:20px;background:#fff;border:1.5px solid #0C0C0E;border-radius:10px;padding:20px 24px;display:flex;flex-direction:column;gap:12px}
.cv .card .lab{font-size:12px;font-weight:500;letter-spacing:.04em;color:#44444C;text-transform:none}
.made{max-height:268px;overflow:hidden}
.cv .made p{margin:0;font-size:17px;line-height:1.4}
.cv .cover-plan ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.cv .cover-plan li{display:grid;grid-template-columns:5px 1fr;column-gap:12px;align-items:start;font-size:17px;line-height:1.4}
.cv .cover-plan li i{display:block;width:5px;height:5px;background:#0C0C0E;margin-top:calc(17px*1.4/2 - 2.5px)}
.cv .pl{margin:24px 0 0;font-size:15px;height:42px;overflow:hidden}
.cv .nx{margin:auto 0 0;font-size:15px;color:#44444C;height:21px;overflow:hidden;white-space:nowrap}
/* how + plan */
.hp{position:absolute;left:64px;top:64px;width:688px;height:866px;display:flex;flex-direction:column;overflow:hidden}
.hp .top{display:flex;justify-content:space-between;font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:12px;letter-spacing:.04em}
.hp table{margin-top:18px;width:100%;border-collapse:collapse;table-layout:fixed}
.hp th{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:11px;letter-spacing:.04em;color:#44444C;text-align:left;padding:0 0 8px;border-bottom:1px solid #0C0C0E}
.hp td{height:54px;border-bottom:1px solid #E0E0E5;padding:0;vertical-align:middle}
.hp .d{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:16px;width:96px}
.hp .tp{display:block;height:50px;overflow:hidden;padding-top:4px}
.hp .tp b{display:block;font-weight:500;font-size:18px;line-height:1.3;white-space:nowrap}
.hp .tp .t2{display:block;font-size:14px;color:#44444C;white-space:nowrap}
.hp .pp{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:16px;width:96px}
.hp .plan-time{display:block;font-size:13px;line-height:18px;color:#44444C}
.hp .dn{width:56px;text-align:right}
.hp .how{margin-top:auto;border-top:1px solid #0C0C0E;padding-top:14px;display:flex;flex-direction:column;gap:12px}
.hp .hw{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.2fr) minmax(0,1fr) minmax(0,.9fr);gap:16px}
.hp .hw p{margin:8px 0 0;font-size:14px;overflow-wrap:normal}
.hp .scan-address{display:inline-block;white-space:nowrap}
.hp .chip{font-size:13px}
/* back cover */
.bk{position:absolute;left:64px;top:64px;width:688px;height:866px;display:flex;flex-direction:column;align-items:flex-start;overflow:hidden}
.bk h2{margin:32px 0 0;font-weight:300;font-size:44px;line-height:1.18}
.bk p{margin:12px 0 0;font-size:17px;color:#44444C}
.map{margin-top:36px;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:18px 40px}
.map .lv{display:flex;flex-direction:column;align-items:center;gap:6px}
.map .lv i{display:block;width:56px;height:56px;border:1.2px solid #0C0C0E;background:#fff}
.map .lv .ll{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:14px}
.map .lv.now i{border-width:3px}
.map .lv.now .ll{font-weight:500}
.bk .key{margin-top:32px;display:flex;gap:18px;align-items:center;font-size:15px}
.bk .key i{display:inline-block;width:20px;height:20px;border:1.2px solid #0C0C0E;vertical-align:middle;margin-right:6px}

/* The measured page plan uses the adopted layout. Saved legacy pages keep their layout. */
.pg.consistent .frame{height:856px;gap:8px}
.pg.consistent .hd{max-height:150px}
.pg.consistent.mid .hd{min-height:112px}
.pg.consistent .nd{margin-bottom:10px}
.pg.consistent .ct{gap:calc(8px + var(--extra-gap,0px))}
.pg.consistent .blk{flex:0 0 auto;gap:calc(6px + var(--extra-gap,0px))}
.pg.consistent .blk.grow{flex:1 0 auto}
.pg.consistent .ft{top:939px;height:48px}
.pg.consistent [data-measure^="review-"]{margin:0}
/* (Each block and each of its grids grows by its rows, so every row of the page gets the same share: the full U4 books
   of seeds ed6ecc9f and 19bacf2a, whose Practice 2 grew 3 rows and 2 rows by the same amount.) */
.pg.consistent.stretch .ct>.blk:has(>:is(.two,.cols,.list,.facts,.pcards,.mxs)){flex:var(--rows,1) 0 auto;display:flex;flex-direction:column}
.pg.consistent.stretch .ct>.blk>:is(.two,.cols,.facts,.pcards,.mxs){flex:var(--rows,1) 0 auto;grid-auto-rows:auto;align-content:stretch}
.pg.consistent.stretch .ct>.blk>.list{flex:var(--rows,1) 0 auto}.pg.consistent.stretch .ct>.blk>.list>*{flex:1 0 auto}
.pg.consistent.stretch .ct>.blk[data-slot="now-you"]{flex:var(--rows,1) 0 auto;display:flex;flex-direction:column}
.pg.consistent.stretch [data-slot="now-you"]>.outl{flex:1 0 auto;display:flex;flex-direction:column}
.pg.consistent.stretch [data-slot="now-you"]>.outl>.two{flex:1 0 auto;align-content:stretch}
.pg.consistent .list{flex:none;justify-content:flex-start;gap:calc(12px + var(--extra-gap,0px))}
.pg.consistent .two{flex:none;grid-auto-rows:auto;row-gap:calc(12px + var(--extra-gap,0px))}
/* U4 to U9 (the large type): a tighter row gap, boxes the same size; a true or false pair one box high (Savar,
   2026-11-04: 8 practice questions on a U4 page). */
.pg.consistent.early .two,.pg.consistent.early .cols{row-gap:calc(6px + var(--extra-gap,0px))}
.pg.early .circ.words:not(.likelihood) .co{min-height:22px}
.pg.consistent .facts{flex:none;align-content:start;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:32px;row-gap:calc(10px + var(--extra-gap,0px))}
.pg.consistent .pcards{flex:none;grid-auto-rows:auto;column-gap:32px;row-gap:calc(12px + var(--extra-gap,0px))}
.pg.consistent .cols{flex:none;align-content:start;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:32px;row-gap:calc(12px + var(--extra-gap,0px))}
.pg.consistent .cols .ab{height:48px}
.pg.consistent .places-item .rgs{display:grid;grid-template-columns:repeat(var(--places),minmax(0,1fr));gap:8px;flex-basis:100%;width:100%;margin-left:0;align-items:stretch}
.pg.consistent .places-item .rg{display:flex;flex-direction:column;gap:6px}
.pg.consistent .places-wide .rg{justify-content:flex-end}
.pg.consistent .places-item .rl{font-size:var(--small);white-space:normal;text-align:center}
.pg.consistent .col .sum{margin-left:auto}
.pg.consistent.mid .col .sum{font-size:20px}
.pg.consistent .q .rgs{margin-left:auto}
.pg.consistent .ab{height:64px;min-width:64px}
.pg.consistent[data-page-type="friday-5"] .ab,.pg.consistent[data-page-type="remember-these-mixed-set"] .ab{height:64px}
.pg.consistent .seq .ab{height:48px;min-width:48px;width:48px}
.pg.consistent .q.seq-item{gap:8px}
.pg.consistent .seq-item .qt{font-size:18px}
.pg.consistent .seq-below .rgs{flex-basis:100%;margin-left:0;padding-left:34px}
.pg.consistent .two>.seq-wide,.pg.consistent .cols>.seq-wide{grid-column:1/-1}
.pg.consistent .two>.places-wide,.pg.consistent .cols>.places-wide{grid-column:1/-1}
.pg.consistent .outl{padding:6px 16px;gap:6px}
/* Two pairs of lesson questions keep their calculation space; the example gives up vertical padding. */
.pg.consistent.expanded-lesson .p-ni{padding-block:8px}
.pg.consistent.expanded-lesson .p-ni .ways .in{padding-block:6px}
.pg.consistent .error-item{display:flex;flex-direction:column;gap:6px}
.pg.consistent .error-item>.q:first-child{flex-wrap:nowrap;align-items:baseline}.pg.consistent .error-item>.q:first-child .wk{flex:1 1 0}
.pg.consistent .error-item .ans{flex-wrap:wrap;gap:12px}.pg.consistent .error-item .ans .fix{margin-left:12px}
.pg.consistent .error-item .ab{height:48px}
/* Practice 2 holds 8 practice questions and Spot the error (U4 to U9, D-226, workbook-early-levels.ts): closer rows. */
.pg.consistent[data-page-type="practice-2"] .cols,.pg.consistent[data-page-type="practice-2"] .two{row-gap:calc(4px + var(--extra-gap,0px))}
.pg.consistent[data-page-type="practice-2"] .two .ab{height:52px;min-width:56px}
.pg.consistent[data-page-type="practice-2"] .q.seq-item{gap:4px}
.pg.consistent .error-item .strip{min-height:48px}
.pg.consistent .ways2 .wb{height:var(--work-min)}
/* Keep the writing region, but place it beside a single full-width numeric review task. */
.pg.consistent .q.compact-wide{display:grid;grid-template-columns:22px minmax(100px,1fr) minmax(160px,1.3fr) auto;gap:12px;align-items:start}
.pg.consistent .q.compact-wide>.n{grid-column:1;grid-row:1}.pg.consistent .q.compact-wide>.qb{grid-column:2;grid-row:1}
.pg.consistent .q.compact-wide>.full{grid-column:3;grid-row:1;min-width:0;padding:0}.pg.consistent .q.compact-wide>.rgs{grid-column:4;grid-row:1}
.pg.consistent[data-page-type="practice-2"]:not(:has([data-slot="solve-it-two-ways"])) :is(.two,.cols){row-gap:calc(12px + var(--extra-gap,0px))}
/* (Its block gap and its practice block's gap grow with the rows' gap, so a section label keeps at least a row gap above
   it when the page's gaps grow to fill it: issue #745, "SPOT THE ERROR" 6 px under rows 12 px apart.) */
.pg.consistent[data-page-type="practice-2"]:has([data-slot="solve-it-two-ways"]) .ct{gap:calc(6px + var(--extra-gap,0px))}
.pg.consistent[data-page-type="practice-2"]:has([data-slot="solve-it-two-ways"]) [data-slot="practice-row"]{gap:calc(4px + var(--extra-gap,0px))}

.pg.consistent .mxs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:32px;row-gap:calc(12px + var(--extra-gap,0px))}
/* Savar, 2026-11-04: a row's cards top-aligned, each number on its text's first line; a story's number on its text's
   baseline, with one gap under its work box; one gap before every section label. */
.pg.consistent .mxs{align-items:start}.mx>.q{align-items:baseline}.mx>.q>.n{padding-top:0}
.story .head{align-items:baseline}
/* Savar, 2026-11-04: true and false are two circle targets in the answer-box column, apart enough to circle one, top-
   aligned with the question's first line; Spot the error's number on its sentence's baseline; a test card's box in one
   place, at its top right. */
.circ.words{flex-direction:column;align-items:center;justify-content:flex-start;gap:12px;min-height:0;min-width:var(--box);padding:0;align-self:flex-start}
.circ.words .co{display:inline-flex;align-items:center;justify-content:center;min-height:28px;min-width:var(--box);padding:0 8px;line-height:1}
.circ.words.likelihood{flex-direction:row;gap:12px;min-width:0}.circ.words.likelihood .co{min-width:0;min-height:44px;padding:0 6px}
.q .rgs:has(>.circ.words){align-self:flex-start}
.tc>.q{flex-wrap:nowrap;align-items:flex-start}.tc>.q>.qb{flex:1 1 0;min-width:0}.tc>.q>.rgs{margin-left:auto;flex:none;align-self:flex-start}
.pg.consistent [data-slot="word-problems"] .story{padding-bottom:14px}
.pg.consistent .mx .stp{flex-wrap:wrap}
.pg.consistent .mx .sl{min-width:0}
.pg.consistent .chc{padding:12px;gap:8px}
.pg.consistent .chc .act{display:flex;gap:16px;align-items:flex-end;flex:1}
.pg.consistent .chs.side3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.pg.consistent .chs.side3 .top{gap:8px}
.pg.consistent .chs.side3 .act{flex-direction:column;align-items:stretch;gap:8px}
.pg.consistent .chs.side3 .act .wb{width:100%;min-width:0}
.pg.consistent .chs.side3 .act .rg{align-self:flex-end}
.pg.consistent.older-extra .ab{height:88px}
/* The shading is the question's only: the work space under it is white paper. A layer behind the question paints it,
   from the card's edge to half the gap under the question, so no box moves: the card and its work space keep their size. */
.pg.consistent .chc.plain{background:#fff}.pg.consistent .chc.plain>.top{position:relative;z-index:0}
.pg.consistent .chc.plain>.top::before{content:"";position:absolute;z-index:-1;left:-12px;right:-12px;top:-12px;bottom:-4px;background:#F4F2F0;border-radius:10.5px 10.5px 0 0}
.pg.consistent .chc.nowork{flex:0 0 auto}.pg.consistent .chc.nowork .act{flex:0 0 auto;align-items:flex-start}
.pg.consistent [data-slot="word-problems"] .story{flex:1}
.pg.consistent [data-slot="word-problems"] .story.nowork{flex:0 0 auto}
.story.nowork .head{align-items:center}.story.nowork .qb{flex:1 1 0}
/* The layout checks (Savar's page reviews, 2026-11-04; src/lib/workbook-layout-check.ts). One gap before every section
   label, wider than the 6 px under it and no narrower than the rows' gap: 12 px (10 on Practice 2, whose rows are 4 px
   apart, D-226, and at U4 to U9). */
.pg.consistent .ct{gap:calc(12px + var(--extra-gap,0px))}
.pg.consistent .blk>:is(.lab,.chiprow,[data-measure^="chip-"]):not(:first-child){margin-top:6px}
.pg.consistent[data-page-type="practice-2"] .ct{gap:calc(10px + var(--extra-gap,0px))}
.pg.consistent[data-page-type="practice-2"] .blk>:is(.lab,.chiprow,[data-measure^="chip-"]):not(:first-child){margin-top:4px}
/* (U4 to U9: rows 6 px apart, 10 px before a label.) */
.pg.consistent.early .ct{gap:calc(10px + var(--extra-gap,0px))}
.pg.consistent.early .blk>:is(.lab,.chiprow,[data-measure^="chip-"]):not(:first-child){margin-top:4px}
/* A question's number and first line share their baseline, and its answer box's top is that line's top. */
.pg.consistent :is(.two,.list)>.q{align-items:flex-start}
.pg.consistent :is(.two,.list)>.q>:is(.n,.qb){padding-top:0;align-self:baseline}
/* Circle targets on the question's first line: true or false, yes or no, letters or numbers share its baseline (on a
   test card too, its number with them). */
.pg.consistent :is(.two,.list)>.q>.rgs:has(>.circ){align-self:baseline}
.pg.consistent .tc>.q>:is(.badge,.qb,.rgs:has(>.circ)){align-self:baseline}
.pg.consistent .q .circ:not(.words){min-height:var(--box);padding:0 18px;align-items:baseline}
.pg.consistent :is(.two,.list,.tc)>.q>.rgs>.circ:not(.words) .co{font-size:var(--body)}
.pg.consistent .circ.words .co{align-items:flex-start}
/* (The likelihood words in their own row under the question's text, from its left edge.) */
.pg.consistent :is(.two,.list)>.q>.full:has(>.circ.likelihood){padding-left:34px}
/* A fact's number in the page's one number style, on the fact's baseline. */
.pg.consistent .facts .fl{display:flex;align-items:baseline;gap:10px;flex:1 1 auto;min-width:0}
.pg.consistent .facts .fl>.n{min-width:22px}
/* A stories page's numbers are all story numbers (Use 2 ways, Remember these), each on its sentence's baseline. */
.pg.consistent[data-page-type="word-problems"] [data-measure^="number-"]{font-family:"Unica Sans",Helvetica,Arial,sans-serif;font-weight:300;font-size:26px;line-height:1;min-width:26px}
.pg.consistent .tw>.q{align-items:baseline}
/* (After the stories, the same gap as between two stories: the block gap less the blocks' gap within a slot.) */
.pg.consistent .ct>[data-slot="word-problems"]+[data-slot="solve-it-two-ways"]{margin-top:-6px}
.pg.consistent.early .ct>[data-slot="word-problems"]+[data-slot="solve-it-two-ways"]{margin-top:-4px}
/* A Challenge page at its maximum: cards with nothing to work in grow too, so no room is left under the last one (the
   full U4 book's Day 10). */
.pg.consistent.stretch .chs>.chc.nowork{flex:1 0 auto}
.pg.consistent .story .act{flex:1}
.pg.consistent .story .act .wb,.pg.consistent .chc .act .wb{height:auto!important;min-height:var(--work-min);align-self:stretch}
`;

// ---------- Icons ----------

const svg = (body: string) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  book: svg(`<path d="M2 3.5h4.5a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 0-1.5-1.5H2zM14 3.5H9.5A1.5 1.5 0 0 0 8 5v8a1.5 1.5 0 0 1 1.5-1.5H14z"/>`),
  target: svg(`<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r=".6" fill="currentColor"/>`),
  bolt: svg(`<path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z"/>`),
  shuffle: svg(`<path d="M2 4.5h2.5c3 0 4 7 7 7H14M2 11.5h2.5c1.2 0 2-1 2.8-2.3M9 6.5c.7-1.2 1.4-2 2.5-2H14M12 2.5l2 2-2 2M12 9.5l2 2-2 2"/>`),
  search: svg(`<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3.5 3.5"/>`),
  bulb: svg(`<path d="M6 12.5h4M6.5 14.5h3M8 1.5a4.5 4.5 0 0 0-2.5 8.2V11h5V9.7A4.5 4.5 0 0 0 8 1.5z"/>`),
  wrench: svg(`<path d="M10.5 2a3.5 3.5 0 0 0-3.3 4.6L2 11.8 4.2 14l5.2-5.2A3.5 3.5 0 0 0 14 5.5l-2 .5-1.5-1.5.5-2z"/>`),
  star: svg(`<path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/>`),
  pencil: svg(`<path d="M10.5 2.5 13.5 5.5 5.5 13.5H2.5V10.5z"/>`),
  check: svg(`<path d="m3 8.5 3 3 7-7"/>`),
};

interface Chip { label: string; cls: string; icon?: string }
const CHIPS: Partial<Record<SlotName, Chip>> = {
  "warm-up": { label: "Warm-up", cls: "c-wu", icon: ICONS.bolt },
  "fix-it": { label: "Fix it", cls: "c-fx", icon: ICONS.wrench },
  "spot-the-error": { label: "Spot the error", cls: "c-ni", icon: ICONS.search },
  "mixed-set": { label: "Mixed set", cls: "c-mx", icon: ICONS.shuffle },
  "friday-5": { label: "Friday 5", cls: "c-mx", icon: ICONS.shuffle },
  challenge: { label: "Challenge", cls: "c-ch", icon: ICONS.bulb },
  "remember-these": { label: "Review", cls: "c-rv" },
  "picture-stories": { label: "Stories", cls: "c-wp", icon: ICONS.book },
  "math-in-the-world": { label: "Math in the world", cls: "c-wp" },
  "show-what-you-know": { label: "Show what you know", cls: "c-rv", icon: ICONS.star },
  "level-test": { label: "Level test", cls: "c-lt", icon: ICONS.pencil },
  "unit-check": { label: "Quick check", cls: "c-rv", icon: ICONS.check },
  "mini-test": { label: "Mini-test", cls: "c-lt", icon: ICONS.pencil },
  "already-know-it": { label: "Already know it?", cls: "c-rv", icon: ICONS.check },
  reminder: { label: "Remember", cls: "c-ni", icon: ICONS.book },
};
const NEW_IDEA: Chip = { label: "New idea", cls: "c-ni", icon: ICONS.book };
const PRACTICE: Chip = { label: "Practice", cls: "c-pr", icon: ICONS.target };
const NOTES: Partial<Record<SlotName, string>> = {
  // The Challenge page's subtitle says "One (or two) to stretch you."; its chip has no note. The warm-up's instruction
  // says what it is (WARM_UP_INSTRUCTION): its chip has no note either, never a counting one.
  "spot-the-error": "One move is wrong. Find it, then write the fix.",
  "mixed-set": "Tick the operation, then write the answer.",
  "friday-5": "5 from earlier days. No hints.",
  "show-what-you-know": "One of each, and the hardest ones again.",
  "level-test": "No hints. Do your best.",
};

const chipHtml = (chip: Chip, note?: string) =>
  `<div class="chiprow"><span class="chip ${chip.cls}">${chip.icon ?? ""}<span>${escape(chip.label)}</span></span>${note ? `<span class="side">${escape(note)}</span>` : ""}</div>`;

// ---------- Figures (drawn by code, DESIGN.md section 4 visual models) ----------

const COUNTER = ["#FF6A3D", "#3366F0", "#16A06A"];

export function figureSvg(f: Figure, scale = 1, cell = 30): string {
  const out = (w: number, h: number, body: string) =>
    `<svg class="pic" width="${Math.round(w * scale)}" height="${Math.round(h * scale)}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  switch (f.kind) {
    case "dots": {
      let x = 0;
      let body = "";
      // The last `takenAway` dots, counted from the end, are crossed out.
      const total = f.groups.reduce((a, b) => a + b, 0);
      let seen = 0;
      f.groups.forEach((n, g) => {
        const cols = Math.min(5, n);
        for (let i = 0; i < n; i++) {
          const cx = x + 9 + (i % cols) * 18;
          const cy = 9 + Math.floor(i / cols) * 18;
          body += `<circle cx="${cx}" cy="${cy}" r="7" fill="${COUNTER[g % 3]}"/>`;
          if (seen++ >= total - (f.takenAway ?? 0)) body += `<path d="M${cx - 8} ${cy + 8}L${cx + 8} ${cy - 8}" stroke="#0C0C0E" stroke-width="2"/>`;
        }
        x += cols * 18 + 18;
      });
      const rows = Math.max(1, ...f.groups.map((n) => Math.ceil(n / Math.min(5, n || 1))));
      return out(Math.max(18, x - 18), rows * 18, body);
    }
    case "ten-frame": {
      // A second frame beside the first when more than 10 are filled.
      const frames = f.frames ?? (f.filled > 10 ? 2 : 1);
      // Each part in its own colour, as dots are (orange, then blue); with no parts, every counter blue.
      const colourAt = (i: number) => {
        if (!f.parts) return COUNTER[1];
        let seen = 0;
        for (const [g, n] of f.parts.entries()) if (i < (seen += n)) return COUNTER[g % 3];
        return COUNTER[1];
      };
      let body = "";
      for (let i = 0; i < 10 * frames; i++) {
        const cx = (i % 5) * cell + (cell === 30 ? Math.floor(i / 10) * 166 : 0);
        const cy = Math.floor((i % 10) / 5) * cell + (cell === 40 ? Math.floor(i / 10) * 96 : 0);
        body += `<rect x="${cx + 1}" y="${cy + 1}" width="${cell}" height="${cell}" fill="#fff" stroke="#0C0C0E" stroke-width="1.2"/>`;
        if (i < f.filled) body += `<circle cx="${cx + cell/2+1}" cy="${cy + cell/2+1}" r="10" fill="${colourAt(i)}"/>`;
      }
      return out(cell===40 ? 202 : 152+(frames-1)*166, cell===40 ? 82+(frames-1)*96 : 62, body);
    }
    case "number-line": {
      // Labels are HTML over the drawing, not SVG text, so the print engine can check them like any text.
      const n = Math.round((f.to - f.from) / f.step);
      const w = cell===40 ? Math.max(320,n*40+20) : 320;
      const at = (v: number) => 10 + ((v - f.from) / (f.to - f.from)) * (w - 20);
      let body = `<line x1="4" y1="44" x2="${w - 4}" y2="44" stroke="#0C0C0E" stroke-width="2"/>`;
      let labels = "";
      for (let i = 0; i <= n; i++) {
        const v = f.from + i * f.step;
        body += `<line x1="${at(v)}" y1="38" x2="${at(v)}" y2="50" stroke="#0C0C0E" stroke-width="1.5"/>`;
        labels += `<span class="nlv" style="left:${Math.round(at(v) * scale)}px;top:${Math.round(54 * scale)}px">${v}</span>`;
      }
      for (const [a, b] of f.hops) {
        const mid = (at(a) + at(b)) / 2;
        body += `<path d="M${at(a)} 40 Q${mid} ${Math.max(4, 40 - Math.abs(at(b) - at(a)) / 2)} ${at(b)} 40" stroke="#2453D4" stroke-width="2" fill="none"/><circle cx="${at(a)}" cy="44" r="4" fill="#3366F0"/><circle cx="${at(b)}" cy="44" r="4" fill="#3366F0"/>`;
      }
      return `<div class="nl" style="width:${Math.round(w * scale)}px;height:${Math.round(76 * scale)}px">${out(w, 74, body)}${labels}</div>`;
    }
    case "blocks": {
      // Hundreds as 100-squares (a 10 by 10 grid), then tens as rods, then ones.
      let body = "";
      const hundreds = f.hundreds ?? 0;
      for (let h = 0; h < hundreds; h++) {
        body += `<rect x="${h * 108}" y="0" width="100" height="100" fill="#fff" stroke="#0C0C0E"/>`;
        for (let k = 1; k < 10; k++) body += `<path d="M${h * 108 + k * 10} 0V100M${h * 108} ${k * 10}H${h * 108 + 100}" stroke="#0C0C0E" stroke-width="0.6"/>`;
      }
      const x0 = hundreds * 108;
      for (let t = 0; t < f.tens; t++) {
        for (let u = 0; u < 10; u++) body += `<rect x="${x0 + t * 14}" y="${u * 10}" width="10" height="10" fill="#fff" stroke="#0C0C0E"/>`;
      }
      for (let u = 0; u < f.ones; u++) body += `<rect x="${x0 + f.tens * 14 + 8 + (u % 3) * 14}" y="${70 - Math.floor(u / 3) * 14}" width="10" height="10" fill="#fff" stroke="#0C0C0E"/>`;
      return out(x0 + f.tens * 14 + 8 + 3 * 14, 100, body);
    }
    case "pattern": {
      // Each shape in a 30 px cell; the blank is an empty dashed box to draw in.
      let body = "";
      for (let i = 0; i < f.length; i++) {
        const x = i * 38;
        if (i === f.blank) {
          body += `<rect x="${x + 1}" y="1" width="30" height="30" fill="#fff" stroke="#0C0C0E" stroke-width="1.5" stroke-dasharray="4 3"/>`;
          continue;
        }
        body += shapeSvg(f.core[i % f.core.length], x + 16, 16, COUNTER[(i % f.core.length) % 3]);
      }
      return out(f.length * 38 - 6, 32, body);
    }
    case "array": {
      let body = "";
      for (let r = 0; r < f.rows; r++) for (let c = 0; c < f.columns; c++) body += `<rect x="${c * 12}" y="${r * 12}" width="10" height="10" fill="#3366F0"/>`;
      return out(f.columns * 12, f.rows * 12, body);
    }
  }
}

/** One pattern shape, about 26 px across, centred at (x, y). */
function shapeSvg(shape: string, x: number, y: number, fill: string): string {
  switch (shape) {
    case "circle": return `<circle cx="${x}" cy="${y}" r="12" fill="${fill}"/>`;
    case "square": return `<rect x="${x - 11}" y="${y - 11}" width="22" height="22" fill="${fill}"/>`;
    case "triangle": return `<path d="M${x} ${y - 13}L${x + 13} ${y + 11}H${x - 13}Z" fill="${fill}"/>`;
    case "diamond": return `<path d="M${x} ${y - 13}L${x + 11} ${y}L${x} ${y + 13}L${x - 11} ${y}Z" fill="${fill}"/>`;
    case "heart": return `<path d="M${x} ${y + 11}C${x - 18} ${y - 1} ${x - 8} ${y - 15} ${x} ${y - 5}C${x + 8} ${y - 15} ${x + 18} ${y - 1} ${x} ${y + 11}Z" fill="${fill}"/>`;
    default: {
      // A star: five points.
      const pts = Array.from({ length: 10 }, (_, k) => {
        const r = k % 2 === 0 ? 13 : 5.5;
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        return `${(x + r * Math.cos(a)).toFixed(1)} ${(y + r * Math.sin(a)).toFixed(1)}`;
      });
      return `<path d="M${pts.join("L")}Z" fill="${fill}"/>`;
    }
  }
}

/** A worked line, its [given] numbers in blue. */
/** BC prints numbers from 10 000 up in groups of three with a space (4 digits together, decimals untouched). */
/** (The BC spaces are gone, D-230: numbers print with commas through `escape`.) */
export const bcNumbers = (t: string) => t;
/** Remove a second copy only when the displayed equation already has that exact numeric answer. */
const singleWorkedAnswer = (line: WorkedLine) => line.replace(/(=\s*)(-?\d[\d, \u00a0]*)([.!?]?)\s+Answer:\s*\[([^\]]+)\]/g,
  (whole, equals: string, result: string, punctuation: string, answer: string) =>
    result.replace(/[,\s]/g, "") === answer.replace(/[,\s]/g, "") ? `${equals}[${answer}]${punctuation}` : whole);
/** Keep mixed-case names as supplied. Display an all-capitals name in normal title case on the cover. */
const coverName = (name: string) => name === name.toLocaleUpperCase() ? name.toLocaleLowerCase().replace(/\p{L}+/gu, word => word[0].toLocaleUpperCase() + word.slice(1)) : name;

const worked = (line: WorkedLine) => bcNumbers(escape(printedMinus(singularPlaces(line)))).replace(/\[([^\]]*)\]/g, `<span class="blue">$1</span>`);

// ---------- Questions and their answer regions ----------

/** The digits an answer box must hold, as printed, without its unit. */
function answerChars(v: AnswerValue | null): number {
  if (!v) return 3;
  if (v.type === "quantity") return valueText({ type: "number", value: v.value }).length;
  return valueText(v).length;
}

/** An answer box's width by what goes in it (DESIGN.md section 4): 40 to 48 for 1 or 2 digits, up to 204 for words. */
function boxWidth(v: AnswerValue | null, band: Band): number {
  const n = answerChars(v);
  const w = n <= 2 ? 48 : n <= 4 ? 64 : n <= 7 ? 96 : n <= 12 ? 140 : 204;
  return Math.max(w, band.box);
}

/** The unit word after an answer box ("tiles", "cm"), or "". */
/** Two ways to work a question, by what it asks: add, take away, multiply, share, or null. */
function twoWays(p: QuestionPackage): [string, string] | null {
  const t = `${p.operation?.kind ?? ""} ${p.text}`.toLowerCase();
  const small = Math.max(0, ...(p.text.match(/\d+/g) ?? []).map(Number)) < 20;
  if (small && /subtract|−|\s-\s|left|take|eats|gives|fewer|less|the rest/.test(t)) return ["count back", "count up from the smaller number"];
  // (Making a ten helps only when the sum passes 10: "6 + 1" counts on, or uses fingers.)
  const numbers = (p.text.match(/\d+/g) ?? []).map(Number);
  const pastTen = numbers.length >= 2 && numbers.reduce((a, b) => a + b, 0) > 10;
  if (small && /add|\+|more|in all|together|gets/.test(t)) return ["count on from the bigger number", pastTen ? "make a ten first" : "use your fingers"];
  if (/multiply|×|\beach\b|groups? of|packs? of|times/.test(t)) return ["split a number into parts", "use a fact you know, then the zeros"];
  if (/divide|÷|share|equally/.test(t)) return ["share in groups", "use a times fact"];
  if (/subtract|−|\s-\s|left|take|eats|gives|fewer|less/.test(t)) return ["take away the tens, then the ones", "count up from the smaller number"];
  if (/add|\+|more|in all|together|gets/.test(t)) return ["add the tens, then the ones", "make a ten first"];
  return null;
}

function unitAfter(p: QuestionPackage): string {
  const v = p.answer?.value;
  if (v?.type === "quantity" && v.unit !== "$") return v.unit;
  return p.answer?.unit ?? "";
}

export { regionNames };

const measureAttr = (name: string) => `data-measure="${name}"`;

interface RegionOpts {
  band: Band;
  /** Work box height: a number, or "fill" for the rest of a card. */
  work?: number | "fill";
  /** Calculation space in a practice or review grid. */
  compactWork?: boolean;
  minimumWork?: number;
  /** Show a box region's label before it ("ANSWER", "a)"). */
  labels?: boolean;
  /** Leave out the unit word after a box (a parent-led card has no room; its question names the unit). */
  noUnits?: boolean;
  /** Writing lines with no label (the item's text is their prompt). */
  bare?: boolean;
  /** A picture region drawn as this figure (a parent-led card's squares to colour). */
  figure?: Figure | null;
  /** Leave out the "Tick one" hint beside a tick strip (Spot the error at U1 to U9). */
  noTick?: boolean;
}

function regionHtml(q: DraftQuestion, r: AnswerRegion, name: string, o: RegionOpts): string {
  const at = measureAttr(name);
  switch (r.kind) {
    case "box": {
      const label = o.labels && r.label ? `<span class="rl box">${escape(r.label)}</span>` : "";
      const unit = o.noUnits ? "" : unitAfter(q.package);
      const money = q.package.answer?.value.type === "quantity" && q.package.answer.value.unit === "$" ? `<span class="unit">$</span>` : "";
      return `<span class="rg">${label}${money}<span class="ab" ${at} style="width:${boxWidth(r.answer, o.band)}px"></span>${unit ? `<span class="unit" data-measure="unit-${q.number}-${r.id}">${escape(unit)}</span>` : ""}</span>`;
    }
    case "choice": {
      if (r.mark === "circle") {
        // A pattern's choices are its shapes: drawn, not written (a word such as "triangle" at the fact size is too wide
        // for a card, and a child circles the shape).
        const shapes = r.choices.every((c) => (PATTERN_SHAPES as readonly string[]).includes(c));
        const choice = (c: string) => (shapes ? `<svg class="pic" width="30" height="30" viewBox="0 0 32 32" aria-label="${escape(c)}">${shapeSvg(c, 16, 16, "#44444C")}</svg>` : escape(c));
        // Choices in words ("less than 5", "not equal", "cats") stack in the body type: a card has no room for them in
        // a row at the size of a fact.
        const words = !shapes && r.choices.some((c) => /[a-z]{2}/i.test(c));
        const circled = `<span class="circ${words ? " words" : ""}${likelihood(r) ? " likelihood" : ""}" ${at}>${r.choices.map((c) => `<span class="co">${choice(c)}</span>`).join("")}</span>`;
        // (Unless the question says it: "Circle yes or no.")
        return o.band.cueChoices && !/\bcircle\b/i.test(q.package.text) ? `<span class="rg"><span class="t1" data-measure="cue-${q.number}-${r.id}"><span>Circle one</span></span>${circled}</span>` : circled;
      }
      const choices = r.choices.map((c) => `<span class="ch"><i class="tb"></i><span>${escape(c)}</span></span>`).join("");
      const words = (s: string) => ` ${s.toLowerCase().replace(/[?!.:;,]/g, " ").replace(/\s+/g, " ").trim()} `;
      const label = r.label && !words(q.package.text).includes(words(r.label)) ? r.label : null;
      return `<span class="rg">${label ? `<span class="rl">${escape(label)}</span>` : ""}<span class="strip" ${at}>${choices}</span>${o.noTick ? "" : `<span class="t1"><span>Tick one</span><i>✓</i></span>`}</span>`;
    }
    case "work": {
      if (o.compactWork && o.band.consistentLayout) return `<div class="work-space" ${at} style="min-height:${Math.max(32, questionWorkSpace(q.package))}px"></div>`;
      const h = o.minimumWork !== undefined ? `height:${o.minimumWork}px;--work-min:${o.minimumWork}px` : o.work === "fill" ? "" : `height:max(${o.work ?? 80}px,var(--work-min,64px))`;
      // The page's instruction names this question: its own "Show your work" says it again (Savar, book 1 review).
      const repeated = !!o.band.instructed?.has(q.number) && /^show your work$/i.test(r.label.trim());
      return `<div class="wb" ${at} style="${h}">${repeated ? "" : `<span class="lab">${escape(r.label)}</span>`}</div>`;
    }
    case "lines": {
      // A written-reason item's prompt is its question text; the lines need no label of their own, nor a label the
      // question already asks ("... How do you know?").
      const bare = o.bare || q.package.text.toLowerCase().includes(r.label.toLowerCase());
      return `<div class="ln" ${at}>${bare ? "" : `<div class="lp">${escape(r.label)}</div>`}${"<i></i>".repeat(LINES)}</div>`;
    }
    case "picture":
      if(q.package.item?.format === "colour-or-shade" && o.figure?.kind === "dots") {
        const count=o.figure.groups.reduce((a,b)=>a+b,0);
        return `<div class="picr" ${at}><svg width="${count*40}" height="48" viewBox="0 0 ${count*40} 48">${Array.from({length:count},(_,i)=>`<circle cx="${20+i*40}" cy="24" r="16" stroke="#0C0C0E" fill="white"/>`).join("")}</svg></div>`;
      }
      return o.figure ? `<div class="picr" ${at}>${figureSvg(o.figure,1,o.band.consistentLayout || q.package.item?.format === "colour-or-shade" ? 40 : 30)}</div>` : `<div class="draw" ${at}></div>`;
  }
}

/** The three likelihood words ("never", "sometimes", "always"), circled in a row. */
const likelihood = (region: AnswerRegion) => region.kind === "choice" && region.choices.join(",") === "never,sometimes,always";

/** A box or choice in the question's row; a long word answer ("the square root") and the three likelihood words take
 * their own row under the question, never a narrow column of text. */
const inRow = (region: AnswerRegion) => (region.kind === "box" || region.kind === "choice")
  && !(region.kind === "box" && region.answer?.type === "text" && region.answer.value.length > 8) && !likelihood(region);

/** The regions of a question in a count or an order: printed among its terms, not beside its text. */
function termRegions(q: DraftQuestion): Set<string> {
  const checks = packageItem(q.package).checks;
  const ids = new Set<string>();
  for (const c of checks) {
    if (c.kind === "sequence") for (const t of c.terms) if ("region" in t) ids.add(t.region);
    if (c.kind === "order") c.regions.forEach((id) => ids.add(id));
  }
  return ids;
}

/** A line item's shape: a count under its sentence, a count or a places grid across both columns. */
function lineShape(q: DraftQuestion, band: Band) {
  const checks = packageItem(q.package).checks;
  const sequence = checks.some((c) => c.kind === "sequence");
  const places = checks.some((c) => c.kind === "places");
  const placesWide = !!band.consistentLayout && places && packageItem(q.package).regions.length > 4;
  // A sequence under a sentence ("Count on. What are the next two numbers?") prints on its own line under it, so the
  // sentence keeps the width (never a narrow column of one word a line).
  const below = sequence && !!band.consistentLayout && q.package.text.length > 16;
  // Four boxes or more do not fit half a page's width: the count takes the whole row.
  const wide = below && wideSequence(q);
  return { sequence, places, placesWide, below, wide };
}

/**
 * The regions of a question that sit in a row (boxes, choices) and those that take the full width (work, lines,
 * pictures). A sequence prints its terms in order, its boxes in the blanks: "3, 4, [ ], 6". An order item prints the
 * numbers to put in order before its boxes: "4, 9, 2 → [ ] [ ] [ ]".
 */
function regionsSplit(q: DraftQuestion, o: RegionOpts): { inline: string; full: string } {
  let inline = "";
  let full = "";
  const names = regionNames(q);
  const sequence = packageItem(q.package).checks.find((c) => c.kind === "sequence");
  const inSequence = new Set<string>();
  if (sequence) {
    const terms = sequence.terms.map((t) => {
      if (!("region" in t)) return `<span class="qm">${escape(valueText(t))}</span>`;
      const x = names.find((n) => n.region.id === t.region);
      if (!x) return "";
      inSequence.add(t.region);
      return regionHtml(q, x.region, x.name, o);
    });
    inline += `<span class="seq">${terms.join(`<span class="qm">,</span>`)}</span>`;
  }
  const order = packageItem(q.package).checks.find((c) => c.kind === "order");
  if (order) {
    // The numbers, then the boxes in one row that never breaks: a parent-led card has room for 4 (the generator's limit).
    const boxes = order.regions.flatMap((id) => names.filter((n) => n.region.id === id)).map((x) => regionHtml(q, x.region, x.name, o)).join("");
    order.regions.forEach((id) => inSequence.add(id));
    inline += `<span class="seq"><span class="qm">${escape(order.numbers.map(valueText).join(", "))}</span><span class="qm">→</span></span><span class="obx">${boxes}</span>`;
  }
  for (const { region, name } of names) {
    if (inSequence.has(region.id)) continue;
    const html = regionHtml(q, region, name, o);
    if (inRow(region)) inline += html;
    else full += html;
  }
  const space = o.band.consistentLayout && !names.some(x => x.region.kind === "work") ? questionWorkSpace(q.package) : 0;
  if (space) full += `<div class="work-space" data-measure="workspace-${q.number}" style="min-height:${space}px"></div>`;
  return { inline, full };
}

/** The question's text, marked as its content. */
/** A word with a hyphen ("ten-frame") never breaks at it: the line breaks before the word. */
const keepHyphens = (html: string) => html.replace(/\b([A-Za-z]+(?:-[A-Za-z]+)+)\b/g, `<span style="white-space:nowrap">$1</span>`);
const text = (q: DraftQuestion, cls = "qt") => `<span class="${cls}" ${mark.questionContent(q.number)}>${keepHyphens(bcNumbers(escape(printedMinus(singularPlaces(q.package.text)))))}</span>`;
const isMath = (s: string) => /^[\d\s+−×÷=?.,()/$¢a-z]*$/i.test(s) && /\d/.test(s) && !/[a-z]{3,}/i.test(s);
const qtext = (q: DraftQuestion) => text(q, isMath(q.package.text) ? "qm" : "qt");

/** A count with five terms or more (four boxes): half a page's width does not hold it. */
const wideSequence = (q: DraftQuestion) => ((packageItem(q.package).checks.find((c) => c.kind === "sequence") as { terms?: unknown[] } | undefined)?.terms?.length ?? 0) >= 5;

/** A question in a line: its number, its text, its boxes at the right, then any work box or writing lines under it. */
function lineItem(q: DraftQuestion, band: Band, hint?: WorkedLine | null, work = 80, figure?: Figure | null): string {
  const pictured = packageItem(q.package).regions.some((r) => r.kind === "picture");
  const { sequence, places, placesWide, below, wide } = lineShape(q, band);
  const columns = Math.min(placesWide ? 9 : 4,packageItem(q.package).regions.length);
  const split = regionsSplit(q, { band, work, compactWork: true, labels: true, bare: packageItem(q.package).format === "written-reason", figure: pictured ? figure : null });
  // A picture the child reads (dots to count, a pattern) sits under the question, before any work box.
  const inline = split.inline;
  const full = (figure && !pictured ? `<div class="picr">${figureSvg(figure,1,band.consistentLayout ? 40 : 30)}</div>` : "") + split.full;
  return `<div class="q${sequence ? " seq-item" : ""}${below ? " seq-below" : ""}${wide ? " seq-wide" : ""}${places ? " places-item" : ""}${placesWide ? " places-wide" : ""}" ${mark.question(q.number)}><span class="n">${questionNumber(q.number)}</span><span class="qb">${qtext(q)}${hint ? ` <span class="qm">${worked(hint)}</span>` : ""}</span>`
    + `<span class="rgs"${places ? ` style="--places:${columns}"` : ""}>${inline}</span>${full ? `<div class="full">${full}</div>` : ""}</div>`;
}

/** A fact in a grid: small grey number, the fact, the box. */
function factItem(q: DraftQuestion, band: Band): string {
  const { inline } = regionsSplit(q, { band });
  // (The measured layout: the number in the page's number style, on the fact's baseline.)
  if (band.consistentLayout) return `<div class="q" ${mark.question(q.number)}><span class="fl"><span class="n">${questionNumber(q.number)}</span>${text(q, "qm")}</span>${inline}</div>`;
  return `<div class="q" ${mark.question(q.number)}><span class="gn">${questionNumber(q.number)}</span>${text(q, "qm")}${inline}</div>`;
}

/** A sum in columns (whole-number add, subtract and multiply), the answer box under the rule. */
function columnItem(q: DraftQuestion, band: Band): string {
  const op = q.package.operation;
  if (!op || !(op.kind === "add" || op.kind === "subtract" || op.kind === "multiply")) return lineItem(q, band);
  const [a, b] = op.operands;
  const sign = op.kind === "add" ? "+" : op.kind === "subtract" ? "−" : "×";
  const names = regionNames(q);
  const answer = names.find((x) => x.region.kind === "box")!;
  const box = `<span class="ab" ${measureAttr(answer.name)} style="width:${Math.max(boxWidth(answer.region.kind === "box" ? answer.region.answer : null, band), 72)}px"></span>`;
  return `<div class="col" ${mark.question(q.number)}><span class="n">${questionNumber(q.number)}</span><div class="sum"><div ${mark.questionContent(q.number)}><div class="row"><span>${a}</span></div><div class="row"><span class="op">${sign}</span><span>${b}</span></div></div><div class="rule">${box}</div></div></div>`;
}

/** A question in a card: number badge, text, its boxes, then work or lines. */
function cardItem(q: DraftQuestion, band: Band, work: number | "fill" = 80, cls = "card", figure?: Figure | null): string {
  const pictured = packageItem(q.package).regions.some((r) => r.kind === "picture");
  const split = regionsSplit(q, { band, work, labels: true, figure: pictured ? figure : null });
  const inline = split.inline;
  const full = (figure && !pictured ? `<div class="picr">${figureSvg(figure,1,band.consistentLayout ? 40 : 30)}</div>` : "") + split.full;
  return `<div class="${cls}" ${mark.question(q.number)}><div class="q"><span class="badge">${questionNumber(q.number)}</span><span class="qb">${qtext(q)}</span><span class="rgs">${inline}</span></div>${full ? `<div class="q" style="margin-top:10px">${full}</div>` : ""}</div>`;
}

/**
 * A parent-led item: the short instruction the parent reads (up to 3 lines, D-201), a picture, the big answer. A
 * question the child answers by circling has a pencil; there is no read-aloud mark (D-201: the grown-up line already
 * says to read each line aloud).
 */
function parentItem(q: DraftQuestion, band: Band, figure: Figure | null | undefined): string {
  // A picture region is the figure itself (squares to colour); any other figure sits beside the answer.
  const pictured = packageItem(q.package).regions.some((r) => r.kind === "picture");
  const { inline, full } = regionsSplit(q, { band, work: 80, noUnits: true, figure: pictured ? figure : null });
  const icon = packageItem(q.package).regions.some((r) => r.kind === "choice") ? `<span class="ico">${ICONS.pencil}</span>` : "";
  return `<div class="pcard" ${mark.question(q.number)}><div class="head"><span class="badge">${questionNumber(q.number)}</span>${icon}${text(q)}</div>`
    + `<div class="pb">${figure && !pictured ? figureSvg(figure,1,band.consistentLayout ? 40 : 30) : ""}<div class="q">${inline}${full}</div></div></div>`;
}

// ---------- Slots ----------

/** Extra U16 lesson questions keep their work space by using less padding in the example. */
function expandedLesson(page: DraftPage): boolean {
  const c = page.content;
  return c?.kind === "day" && c.level === 16 && page.type === "new-idea"
    && c.blocks.some(b => b.slot === "now-you" && b.items.length >= 3);
}

/** Three lesson questions make one pair and one full-width question, never an empty half row. */
function wideLessonQuestion(page: DraftPage, items: readonly number[]): number | undefined {
  return expandedLesson(page) && items.length === 3 ? items[2] : undefined;
}

interface Ctx {
  page: DraftPage;
  c: DayContent;
  band: Band;
  q: (n: number) => DraftQuestion;
  six: boolean;
  /** The page's one Review heading, block by block (reviewLayout, which pagePlan reads too). */
  review: ReviewLayout[];
}

/** Each block's part in the page's one Review heading (reviewLayout). */
export interface ReviewLayout {
  /** The page has not said "Review" yet when the block starts. */
  open: boolean;
  /** The block prints the Review pill (a "remember-these" block that is not the page's first). */
  pill: boolean;
  /** Where the block's review questions start a grid of their own under a Review label; -1 for one grid. */
  at: number;
}

/** Slots whose questions print through blockHtml's `list`, the one place a block's review questions can take their own grid. */
function listsQuestions(slot: SlotName, parent: boolean): boolean {
  switch (slot) {
    case "warm-up": case "remember-these": case "finish-these": case "on-your-own": case "practice-row": case "unit-b-practice":
    case "picture-stories": case "friday-5": case "unit-check": case "mini-test": case "already-know-it":
      return true;
    case "fix-it": case "now-you": case "show-what-you-know": case "level-test":
      return parent;
    default:
      return false;
  }
}

/**
 * The page's one Review heading (Savar, 2026-11-09: "Remember these" reads "Review", and never twice on a page), decided
 * once for the printed page (blockHtml) and the fit check's plan (pagePlan): the heading is open until a label or pill
 * prints it, or closed from the start when the page title already says it ("Review", "Mixed review"). A block whose
 * review questions come after the heading was said keeps them in its one grid.
 */
export function reviewLayout(page: DraftPage): ReviewLayout[] {
  const c = page.content;
  if (c?.kind !== "day") return [];
  const parent = bandOf(c.level).name === "parent";
  const present = new Set(page.questions.map(q => q.number));
  let open = !/\breview\b/i.test(reviewTitle(c.title));
  return c.blocks.map((b, i) => {
    const start = open;
    const firstOfPage = i === 0 && (page.type === "remember-these" || page.type === "remember-these-mixed-set");
    const pill = b.slot === "remember-these" && !firstOfPage && open;
    if (pill) open = false;
    const items = b.items.filter(n => present.has(n));
    const at = listsQuestions(b.slot, parent) && b.reviewFrom !== undefined && open ? items.findIndex(n => n >= b.reviewFrom!) : -1;
    if (at >= 0) open = false;
    return { open: start, pill, at };
  });
}

function blockHtml(b: Block, i: number, ctx: Ctx): string {
  const { band, c } = ctx;
  const qs = b.items.map(ctx.q);
  const prev = c.blocks[i - 1]?.slot;
  const parent = band.name === "parent";
  // A step page's review questions print under their own "Remember these" label (the U16 review: earlier steps mixed into
  // the page's practice read as off-topic).
  // Each grid carries its row count (--rows): a page that grows its rows to fill it gives every row the same share.
  const grid = (cls: string, part: DraftQuestion[]) => {
    const wide = (n: number) => /^(?:two|cols)$/.test(cls) && (["friday-5", "mini-test"].includes(b.slot) && n === part.at(-1)?.number || ((s) => s.wide || s.placesWide)(lineShape(ctx.q(n), band)));
    return `<div class="${cls}" style="--rows:${gridRows(part.map((q) => q.number), cls === "list" ? 1 : 2, wide).length}">`;
  };
  const list = (render: (q: DraftQuestion, k: number) => string, cls = "list") => {
    // (With the page's Review heading already said, the block's review questions continue its grid.)
    const at = ctx.review[i]?.at ?? -1;
    if (at < 0) return `${grid(cls, qs)}${qs.map((q, k) => {
      const last = ["friday-5", "mini-test"].includes(b.slot) && k === qs.length - 1;
      const html = render(q, k);
      const compact = last && c.consistentLayout && html.startsWith('<div class="q') && isMath(q.package.text)
        && packageItem(q.package).format === "write-number" && questionWorkSpace(q.package) > 0;
      return html.replace(/^(<div class=")([^"]+)(")/, `$1$2${compact ? " compact-wide" : ""}$3${last ? ' style="grid-column:1/-1"' : ""}`);
    }).join("")}</div>`;
    if (at === 0) return `<div class="lab" data-measure="review-${i}">Review</div>${grid(cls, qs)}${qs.map((q, k) => render(q, k).replace(/^(<div class="[^"]+")/, ["friday-5", "mini-test"].includes(b.slot) && k === qs.length - 1 ? '$1 style="grid-column:1/-1"' : "$1")).join("")}</div>`;
    return `${grid(cls, qs.slice(0, at))}${qs.slice(0, at).map(render).join("")}</div><div class="lab" data-measure="review-${i}">Review</div>${grid(cls, qs.slice(at))}${qs.slice(at).map((q, k) => render(q, k + at)).join("")}</div>`;
  };
  const line = (q: DraftQuestion, k: number) => (parent ? parentItem(q, band, b.figures?.[k]) : lineItem(q, band, b.hints?.[k], 80, b.figures?.[k]));
  const items = (cls = "list") => (parent ? list(line, "pcards") : list(line, cls));
  const chip = (fallback?: Chip, note?: string) => {
    const own = CHIPS[b.slot] ?? fallback;
    const said = b.slot === "warm-up" ? undefined : b.note ?? note ?? NOTES[b.slot];
    return own ? `<div data-measure="chip-${i}">${chipHtml(own, said)}</div>` : "";
  };
  const allReview = b.reviewFrom !== undefined && qs.length > 0 && qs[0].number >= b.reviewFrom;

  switch (b.slot) {
    case "warm-up":
      return chip() + list((q) => factItem(q, band), "facts");
    case "fix-it":
      if (parent) return chip() + items();
      return chip() + `<div class="panel p-fx"><div class="inner">${qs.map((q, k) => cardItem(q, band, 80, "card", b.figures?.[k])).join("")}</div></div>`;
    case "in-your-head":
      // (Savar, 2026-11-04: "In your head" said nothing; mental math says what to do.)
      return `<div class="panel p-hd"><div class="lab">${escape(b.label && !/^in your head$/i.test(b.label) ? b.label : "Mental math")}</div><div class="note-mm" data-measure="note-${i}">Work it out without writing it down.</div><div class="list" style="margin-top:10px">${qs.map((q) => lineItem(q, band)).join("")}</div></div>`;
    case "remember-these": {
      const pill = !!ctx.review[i]?.pill;
      return (pill ? chip() : "") + items(parent ? "pcards" : "two");
    }
    case "try-first":
      return (prev === undefined ? chipHtml(NEW_IDEA, b.note) : "")
        + `<div class="outl"><div class="lab">Try this first</div>${qs.map((q, k) => lineItem(q, band, null, 80, b.figures?.[k])).join("")}</div>`;
    case "worked-example": {
      const head = prev === "try-first" ? "" : chipHtml(NEW_IDEA, b.note);
      const label = `<div class="lab">Worked example${b.label && !/^example$/i.test(b.label) ? ` · ${escape(b.label)}` : ""}</div>`;
      // A Watch out line is a note under the example: smaller and lighter (Savar, 2026-11-04).
      const note = (t: string) => `<span class="${/^Watch out:/.test(t) ? "wo" : ""}">${escape(t)}</span>`;
      const ways = b.methods && b.methods.length > 0
        ? `<div class="ways" style="grid-template-columns:repeat(${b.methods.length},minmax(0,1fr))">${b.methods.map((m, k) => `<div class="in"><div class="lab">Method ${k + 1}${m.label ? ` · ${escape(m.label)}` : ""}</div><div class="wk">${m.lines.map(worked).join("<br>")}</div></div>`).join("")}</div>`
        : "";
      const why = b.figure || b.explain
        ? `<div class="${b.figure ? "fig2" : "full-width"}">${b.figure ? figureSvg(b.figure, band.name === "mid" ? 1 : 1.3,c.consistentLayout ? 40 : 30) : ""}<div class="why"><div class="lab">What's going on</div><span>${escape(b.explain ?? "")}</span></div></div>`
        : "";
      return head + `<div class="panel p-ni" data-measure="panel-${i}" style="display:flex;flex-direction:column;gap:${expandedLesson(ctx.page) ? 8 : 12}px">${label}${ways}${ways && b.explain && !b.figure ? note(b.explain) : why}</div>`;
    }
    case "now-you":
      return parent
        ? items()
        : `<div class="outl"><div class="lab" data-measure="heading-${i}">Now it's your turn${b.label ? `: ${escape(b.label)}` : ""}</div><div class="two">${qs.map((q, k) => {
          const html = lineItem(q, band, null, 80, b.figures?.[k]);
          return q.number === wideLessonQuestion(ctx.page, b.items) ? html.replace(/^(<div class="[^"]+")/, '$1 style="grid-column:1/-1"') : html;
        }).join("")}</div></div>`;
    case "spot-the-error": {
      if (!c.consistentLayout) {

      // Full width at every level: Sam's work, the yes/no strip and the fix box do not fit a half-width parent card.
      return `<div class="lab">SPOT THE ERROR</div><div class="outl">`
        + qs.map((q) => {
          const names = regionNames(q);
          const choice = names.find(x => x.region.kind === "choice");
          const box = names.find(x => x.region.kind === "box");
          return `<div class="list" ${mark.question(q.number)}><div class="q"><span class="n">${questionNumber(q.number)}</span>${text(q)}</div>`
            + `<div class="wk">${(b.lines ?? []).map(worked).join("<br>")}</div>`
            + `<div class="q"><span>Is it right?</span>${choice?.region.kind === "choice" ? regionHtml(q, { ...choice.region, label: null }, choice.name, { band, noTick: true }) : `<span class="strip"><span class="ch"><i class="tb"></i>Yes</span><span class="ch"><i class="tb"></i>No</span></span>`}</div>`
            + `<div>If it's not right, fix it:</div>${box ? regionHtml(q, box.region, box.name, { band }) : ""}</div>`;
        }).join("") + `</div>`;

      }

      // Full width at every level: Sam's work, the yes/no strip and the fix box do not fit a half-width parent card.
      return `<div class="lab">SPOT THE ERROR</div><div class="outl">`
        + qs.map((q) => {
          const names = regionNames(q);
          const choice = names.find(x => x.region.kind === "choice");
          const box = names.find(x => x.region.kind === "box");
          return `<div class="error-item" ${mark.question(q.number)}><div class="q"><span class="n">${questionNumber(q.number)}</span><span class="wk" ${mark.questionContent(q.number)}>${(b.lines ?? []).map(worked).join("<br>")}</span></div><div class="q ans"><span>Is it right?</span>${choice?.region.kind === "choice" ? regionHtml(q, { ...choice.region, label: null }, choice.name, { band, noTick: true }) : `<span class="strip"><span class="ch"><i class="tb"></i>Yes</span><span class="ch"><i class="tb"></i>No</span></span>`}`
            + `<span class="fix">If not, fix it:</span>${box ? regionHtml(q, box.region, box.name, { band }) : ""}</div></div>`;
        }).join("") + `</div>`;
    }

    case "watch-one": {
      // The chip above already says "Read the example, then try it.": the box does not say it again (Cedric and Savar,
      // 2026-11-09); a box label of its own ("Increasing rule") stays.
      const own = b.label && !/^example$/i.test(b.label) ? escape(b.label) : "";
      const said = /^read the example/i.test(b.note ?? "");
      const exampleLabel = said ? (own ? `<div class="lab">${own}</div>` : "") : `<div class="lab">Read the example${own ? ` · ${own}` : ""}</div>`;
      return chipHtml(PRACTICE, b.note) + `<div class="panel p-pr" data-measure="panel-${i}" style="display:flex;flex-direction:column;gap:8px">${exampleLabel}<div class="wk">${(b.lines ?? []).map(worked).join("<br>")}</div>${b.explain ? `<span class="${/^Watch out:/.test(b.explain) ? "wo" : ""}">${escape(b.explain)}</span>` : ""}</div>`;
    }
    case "finish-these":
      // (A block of review only prints "Remember these" alone, never under "Getting started" as the page's skill.)
      return (allReview && !!ctx.review[i]?.open ? "" : `<div class="lab" data-measure="heading-${i}">Getting started</div>`) + items(c.consistentLayout || ctx.six ? "two" : "list");
    case "on-your-own": {
      const head = prev === "finish-these" ? (allReview && !!ctx.review[i]?.open ? "" : `<div class="lab" data-measure="heading-${i}">On your own</div>`) : chipHtml(PRACTICE, b.note);
      // Column sums on the 8-page day; the 6-page practice page lists them, as in the sample (DESIGN.md 7.2).
      const columns = band.name === "mid" && !parent && !ctx.six && qs.length > 0 && !b.figures?.some(Boolean) && qs.every((q) => ["add", "subtract", "multiply"].includes(q.package.operation?.kind ?? "") && packageItem(q.package).regions.length === 1 && !questionWorkSpace(q.package));
      return head + (columns ? list((q) => columnItem(q, band), "cols") : items(c.consistentLayout || ctx.six ? "two" : "list"));
    }
    case "practice-row": {
      const head = prev === "practice-row" ? "" : chipHtml(PRACTICE, b.note);
      const columns = band.name === "mid" && !parent && !b.figures?.some(Boolean) && qs.every((q) => ["add", "subtract", "multiply"].includes(q.package.operation?.kind ?? "") && packageItem(q.package).regions.length === 1 && !questionWorkSpace(q.package));
      return head + (b.label ? `<div class="lab">${escape(b.label)}</div>` : "") + (columns ? list((q) => columnItem(q, band), "cols") : items("two"));
    }
    case "unit-b-practice":
      return chipHtml(PRACTICE, b.note) + items(qs.length >= 2 && !parent ? "two" : "list");
    case "solve-it-two-ways":
      return qs.map((q) => {
        const names = regionNames(q);
        // Each work area names a way to do it (#482 review at db3b1a0: two methods asked, none shown).
        const ways = twoWays(q.package);
        const works = names.filter((x) => x.region.kind === "work").map((x, k) => regionHtml(q, ways && x.region.kind === "work" ? { ...x.region, label: `Method ${k + 1}: ${ways[k] ?? ""}`.trim() } : x.region, x.name, { band, work: 110, ...(c.consistentLayout ? { minimumWork: Math.max(102, questionWorkSpace(q.package) + 38) } : {}) })).join("");
        const boxes = names.filter((x) => x.region.kind === "box").map((x) => regionHtml(q, x.region, x.name, { band, labels: true })).join("");
        return `<div class="tw" ${mark.question(q.number)}><div class="q"><span class="n">${questionNumber(q.number)}</span><span class="lab" style="color:#0C0C0E">${c.consistentLayout ? "Use 2 ways" : "Solve it two ways"}</span><span class="qb">${qtext(q)}</span></div><div class="ways2">${works}${boxes}</div></div>`;
      }).join("");
    case "word-problems":
      return qs.map((q, k) => {
        const names = regionNames(q);
        const work = names.filter((x) => x.region.kind === "work").map((x) => regionHtml(q, x.region, x.name, { band, work: c.consistentLayout ? workMinimum(c.level) : band.name === "early" && qs.length===2 ? 120 : 88 })).join("");
        const boxes = names.filter((x) => x.region.kind === "box" || x.region.kind === "choice").map((x) => regionHtml(q, x.region, x.name, { band, labels: true })).join("");
        const fig = b.figures?.[k];
        // A question with nothing to work out (true or false, a choice) circles its answer beside its text: no empty
        // work area (the U4 review).
        if (!work && c.consistentLayout) return `<div class="story nowork" ${mark.question(q.number)}><div class="head"><span class="sn">${questionNumber(q.number)}</span><span class="qb">${text(q)}</span>${fig ? figureSvg(fig,1,40) : ""}${boxes}</div></div>`;
        return `<div class="story" ${mark.question(q.number)}><div class="head"><span class="sn">${questionNumber(q.number)}</span><span class="qb">${text(q)}</span>${fig ? figureSvg(fig,1,c.consistentLayout ? 40 : 30) : ""}</div><div class="act">${work}${boxes}</div></div>`;
      }).join("");
    case "how-do-you-know":
      return qs.map((q) => {
        const [lines] = regionNames(q);
        return `<div ${mark.question(q.number)}><div class="ln" ${measureAttr(lines.name)}><div class="lp"><span class="n">${questionNumber(q.number)}</span> ${text(q)}</div>${"<i></i>".repeat(LINES)}</div></div>`;
      }).join("");
    case "reminder": {
      if (b.label === "Likelihood words") return chip(undefined, b.note) + `<div class="panel p-ni" data-measure="panel-${i}"><div class="lab">Likelihood words</div><div>${escape(b.explain ?? "")}</div></div>`;
      const fig = b.figure ? figureSvg(b.figure,1,c.consistentLayout ? 40 : 30) : "";
      const why = b.explain?.trim() ? `<div class="why"><div class="lab">What's going on</div><span>${escape(b.explain)}</span></div>` : "";
      // The chip above says "Remember": a box label that says it again is left out (Savar, 2026-11-09).
      const label = (b.label ?? "").trim() && b.label!.trim().toLowerCase() !== CHIPS.reminder!.label.toLowerCase() ? `<div class="lab">${escape(b.label!)}</div>` : "";
      return chip(undefined, b.note) + `<div class="panel p-ni" data-measure="panel-${i}"><div class="fig2"><div style="display:flex;flex-direction:column;gap:8px">${label}${fig}<div class="wk">${(b.lines ?? []).map(line => worked(singleWorkedAnswer(line))).join("<br>")}</div></div>${why}</div></div>`;
    }
    case "mixed-set":
      return chip() + `<div class="mxs" style="--rows:${Math.ceil(qs.length / 2)}">` + qs.map((q) => {
        const names = regionNames(q);
        const pick = (kind: AnswerRegion["kind"]) => names.find((x) => x.region.kind === kind);
        const tick = pick("choice");
        const box = pick("box");
        const work = pick("work");
        const choices = tick && tick.region.kind === "choice" ? tick.region.choices.map((c) => `<span class="ch"><i class="tb"></i><span>${escape(c)}</span></span>`).join("") : "";
        return `<div class="mx" ${mark.question(q.number)}><div class="q"><span class="n">${questionNumber(q.number)}</span><span class="qb">${text(q)}</span></div>`
          + (tick ? `<div class="stp"><span class="sb">1</span><span class="sl">Tick the operation:</span><span class="strip" ${measureAttr(tick.name)}>${choices}</span><span class="t1"><span>Tick one</span><i>✓</i></span></div>` : "")
          + (box ? `<div class="stp"><span class="sb">2</span><span class="sl">Write the answer:</span>${regionHtml(q, box.region, box.name, { band })}${work ? regionHtml(q, work.region, work.name, { band, work: 64 }) : ""}</div>` : "")
          + `</div>`;
      }).join("");
    case "picture-stories":
      return chip() + list((q, k) => parentItem(q, band, b.figures?.[k]), "pcards");
    case "friday-5": case "unit-check": case "mini-test": case "already-know-it":
      return chip() + items(parent ? "pcards" : c.consistentLayout || qs.length>5 ? "two" : "list");
    case "show-what-you-know": case "level-test": {
      // The test and the celebration fill their page: each item is a card in a grid whose rows share the room left
      // under the chip, and its work area grows into its card (an item with no work region gets a plain one).
      if (parent) return chip() + list((q, k) => parentItem(q, band, b.figures?.[k]), `pcards fill`);
      const cols = qs.length <= 3 ? 1 : 2;
      // Every row is full: a wide card takes its row, and a half card left alone in its row takes the row too (the real U4
      // sample: rows with one half card and an empty half).
      const wide = qs.map((q) => cols > 1 && c.consistentLayout && wideSequence(q));
      const full = new Set<number>();
      if (cols > 1 && c.consistentLayout) {
        let run = 0;
        qs.forEach((_, k) => {
          if (wide[k]) { if (run % 2 === 1) full.add(k - 1); run = 0; return; }
          run++;
          if (k === qs.length - 1 && run % 2 === 1) full.add(k);
        });
      }
      return chip() + `<div class="fill" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${qs.map((q, k) => {
        const { inline, full: area } = regionsSplit(q, { band, work: "fill", labels: true });
        // A work area only for an item that needs working (the U4 review, item 10), on the measured layout.
        const work = area || (c.consistentLayout ? "" : `<div class="wb"><span class="lab">Show your work</span></div>`);
        return `<div class="tc"${wide[k] || full.has(k) ? ` style="grid-column:1/-1"` : ""} ${mark.question(q.number)}><div class="q"><span class="badge">${questionNumber(q.number)}</span><span class="qb">${qtext(q)}</span><span class="rgs">${inline}</span></div>${work}</div>`;
      }).join("")}</div>`;
    }
    case "challenge": {
      if (!c.consistentLayout) {

      const side = ctx.six && qs.length === 2;
      const work = "fill" as const;
      return chip() + `<div class="chs${side ? " side2" : ""}">${qs.map((q) => {
        const { inline, full } = regionsSplit(q, { band, work });
        return `<div class="chc" ${mark.question(q.number)}><div class="top"><span class="badge">${questionNumber(q.number)}</span><span class="qb">${text(q)}</span>${inline}</div>${full}</div>`;
      }).join("")}</div>`;

      }

      const side = ctx.six && qs.length === 2;
      const three = ctx.six && qs.length === 3;
      const work = c.consistentLayout ? workMinimum(c.level) : "fill" as const;
      return chip() + `<div class="chs${side ? " side2" : three ? " side3" : ""}">${qs.map((q) => {
        const { inline, full } = regionsSplit(q, { band, work });
        // (A card with nothing to work in, a count with boxes, keeps its height: its boxes sit under the question, never at
        // the foot of an empty card, the real U4 sample.)
        // A card whose work the instruction asks for: its question shaded, its work space white (Savar, book 1 review).
        const plain = full && band.instructed?.has(q.number) ? " plain" : "";
        return `<div class="chc${full ? plain : " nowork"}" ${mark.question(q.number)}><div class="top"><span class="badge">${questionNumber(q.number)}</span><span class="qb">${text(q)}</span></div><div class="act">${full}${inline}</div></div>`;
      }).join("")}</div>`;
    }
    case "math-in-the-world": {
      const info = (b.info ?? []).map((x) => `<div class="ic"><span class="lab">${escape(x.label)}</span><span class="v">${escape(x.value)}</span></div>`).join("");
      return chip() + (info ? `<div class="info">${info}</div>` : "") + qs.map((q) => {
        const names = regionNames(q);
        const boxes = names.filter((x) => x.region.kind === "box");
        if (boxes.length > 1) {
          return `<div class="list" ${mark.question(q.number)}><div class="q"><span class="n">${questionNumber(q.number)}</span><span class="qb">${text(q)}</span></div><div class="parts">${boxes.map((x) => regionHtml(q, x.region, x.name, { band, labels: true }).replace(`<span class="rl box">`, `<span class="rl">`)).join("")}</div></div>`;
        }
        const { inline, full } = regionsSplit(q, { band, work: 120, labels: true });
        return `<div class="list" ${mark.question(q.number)}><div class="q"><span class="n">${questionNumber(q.number)}</span><span class="qb">${text(q)}</span><span class="rgs">${inline}</span></div>${full}</div>`;
      }).join("");
    }
  }
}

// ---------- The page plan (what the layout checks know from the template) ----------

/** A question's answer regions printed beside its first line: how they line up with it, and how far in from the
 * question's right edge their column's edge is. */
export interface BesideAnswers {
  /** The measured names of the regions, by their role (never by where they printed). */
  regions: string[];
  /** "top": each box's top at the first line's top, each circle target on its baseline; "centre": a one-line fact's box
   * centred on it. */
  align: "top" | "centre";
  /** CSS pixels from the question's measured right edge to its column's edge (a card's border and padding). */
  inset: number;
}

/** A day page as its template lays it out (src/lib/workbook-layout-check.ts reads it). */
export interface PagePlan {
  /** The questions of each printed row with more than one question in it, in reading order. */
  rows: number[][];
  /** The questions whose answers print beside their first line. */
  beside: Map<number, BesideAnswers>;
  /** A half-width question with no partner in its grid row. */
  incomplete?: number[];
}

/** Items placed in a grid of `cols` columns, `wide` ones across the whole row (CSS grid's auto-placement). */
function gridRows(items: number[], cols: number, wide: (n: number) => boolean = () => false): number[][] {
  const rows: number[][] = [];
  let row: number[] = [];
  for (const n of items) {
    if (wide(n)) { if (row.length) rows.push(row); rows.push([n]); row = []; continue; }
    row.push(n);
    if (row.length === cols) { rows.push(row); row = []; }
  }
  if (row.length) rows.push(row);
  return rows;
}

/**
 * The plan of a day page on the measured layout: which questions share a printed row (each slot's grid, as blockHtml
 * lays it out) and which answers print beside each question's first line, by their role. Null for any other page.
 */
export function pagePlan(page: DraftPage): PagePlan | null {
  const c = page.content;
  if (!c || c.kind !== "day" || !c.consistentLayout) return null;
  const band: Band = { ...bandOf(c.level), consistentLayout: true };
  const parent = band.name === "parent";
  const six = c.pages <= 6 && band.name === "mid";
  const byNumber = new Map(page.questions.map((q) => [q.number, q]));
  const rows: number[][] = [];
  const beside = new Map<number, BesideAnswers>();
  const incomplete: number[] = [];
  const answers = (n: number, align: BesideAnswers["align"], inset: number) => {
    const q = byNumber.get(n);
    if (!q) return;
    const terms = termRegions(q);
    const regions = regionNames(q).filter((x) => !terms.has(x.region.id) && inRow(x.region)).map((x) => x.name);
    if (regions.length) beside.set(n, { regions, align, inset });
  };
  const line = (n: number) => {
    const q = byNumber.get(n);
    const shape = q ? lineShape(q, band) : null;
    // (A count under its sentence or a places grid prints its answers under the text.)
    if (shape && !shape.below && !shape.places) answers(n, "top", 0);
  };
  const wideLine = (n: number) => { const q = byNumber.get(n); return !!q && (lineShape(q, band).wide || lineShape(q, band).placesWide); };
  const review = reviewLayout(page);
  for (const [i, b] of c.blocks.entries()) {
    const items = b.items.filter((n) => byNumber.has(n));
    // A block's review questions print in a grid of their own under "Review", unless the page said it already (the
    // printed page's decision, reviewLayout).
    const at = review[i]?.at ?? -1;
    const parts = at <= 0 ? [items] : [items.slice(0, at), items.slice(at)];
    const grid = (cols: number, wide?: (n: number) => boolean) => parts.forEach(p => {
      const spans = (n: number) => !!wide?.(n) || ["friday-5", "mini-test"].includes(b.slot) && n === items.at(-1);
      const groups = gridRows(p, cols, spans);
      if (cols === 2) incomplete.push(...groups.flatMap(row => row.length === 1 && !spans(row[0]) ? row : []));
      rows.push(...groups);
    });
    const lines = () => { grid(2, wideLine); items.forEach(line); };
    const cards = () => grid(2);
    switch (b.slot) {
      case "warm-up": grid(2); items.forEach((n) => answers(n, "centre", 0)); break;
      case "fix-it":
        if (parent) cards();
        else { rows.push(...gridRows(items, 3)); items.forEach((n) => answers(n, "top", 14)); }
        break;
      case "in-your-head": case "try-first": items.forEach(line); break;
      case "now-you":
        if (parent) cards();
        else { grid(2, n => wideLine(n) || n === wideLessonQuestion(page, items)); items.forEach(line); }
        break;
      case "on-your-own": case "practice-row": {
        // (blockHtml: column sums, their boxes under the rule, when every question is one sum to work.)
        const qs = items.map((n) => byNumber.get(n)!);
        const sums = band.name === "mid" && !(six && b.slot === "on-your-own") && qs.length > 0 && !b.figures?.some(Boolean)
          && qs.every((q) => ["add", "subtract", "multiply"].includes(q.package.operation?.kind ?? "") && packageItem(q.package).regions.length === 1 && !questionWorkSpace(q.package));
        if (parent) cards(); else if (sums) grid(2); else lines();
        break;
      }
      case "remember-these": case "finish-these": case "friday-5": case "unit-check": case "mini-test": case "already-know-it":
        if (parent) cards(); else lines();
        break;
      case "unit-b-practice":
        if (parent) cards(); else if (items.length >= 2) lines(); else items.forEach(line);
        break;
      case "mixed-set":
        // The operation and answer print in numbered steps under the story, not beside its first line.
        grid(2);
        break;
      case "picture-stories": cards(); break;
      case "show-what-you-know": case "level-test": {
        if (parent) { cards(); break; }
        const cols = items.length <= 3 ? 1 : 2;
        // (blockHtml: a wide count takes its row, and a half card left alone in its row takes the row too.)
        rows.push(...gridRows(items, cols, (n) => wideSequence(byNumber.get(n)!)));
        items.forEach((n) => answers(n, "top", 15));
        break;
      }
      case "challenge":
        if (six && items.length === 2) rows.push(items);
        else if (six && items.length === 3) rows.push(items);
        break;
      case "math-in-the-world":
        for (const n of items) {
          const q = byNumber.get(n)!;
          if (regionNames(q).filter((x) => x.region.kind === "box").length <= 1) answers(n, "top", 0);
        }
        break;
      default: break;
    }
  }
  return { rows: rows.filter((r) => r.length > 1), beside, incomplete };
}

/** Slots that take the free room of their page: their cards and work areas grow into it. */
const GROW = new Set<SlotName>(["challenge", "show-what-you-know", "level-test"]);

// ---------- Pages ----------

const scanMarks = `<i class="scan tl" ${mark.scanMark("tl")}></i><i class="scan tr" ${mark.scanMark("tr")}></i><i class="scan bl" ${mark.scanMark("bl")}></i><i class="scan br" ${mark.scanMark("br")}></i>`;
const wordmark = `<span class="wm"><span>Unica Learning</span><i></i></span>`;

function footer(page: DraftPage, parts: PageParts, id: string): string {
  return `<footer class="ft">${parts.qr}<div class="ids"><span>${escape(id)}</span><span class="pn">Page <span ${mark.pageNumber}>${page.number}</span></span></div>${wordmark}</footer>`;
}

function dayPage(page: DraftPage, parts: PageParts, c: DayContent): string {
  // (`page` is the printed page: its subtitle is the instruction printedInstruction prints; its work line names the
  // questions to show work for.)
  const work = workbookWorkLine(page);
  const band:Band = {...bandOf(c.level),consistentLayout:c.consistentLayout,
    instructed: new Set(work ? workQuestionNumbers(page) : []), cueChoices: isWarmUpPage(c)};
  const byNumber = new Map(page.questions.map((q) => [q.number, q]));
  const ctx: Ctx = {
    page, c, band, six: c.pages <= 6 && band.name === "mid", review: reviewLayout(page),
    q: (n) => {
      const q = byNumber.get(n);
      if (!q) throw new Error(`page ${page.number}: a slot names question ${n}, which the page does not have`);
      return q;
    },
  };
  const label = c.extraPractice ? "Extra practice" : dayLabel(c.day, c.page, c.pages);
  const wholePageExtra = c.blocks.length > 0 && c.blocks.every(b => b.extra);
  const pageExtra = wholePageExtra ? `<span data-measure="chipbadge-extra-page" class="chip c-rv c-extra-inline"><span>Extra page: optional</span></span>` : "";
  const header = `<header class="hd">${c.page === 1 ? `<div class="nd" ${mark.slot("name-date")}><span>Name</span><i class="r1"></i><span>Date</span><i class="r2"></i></div>` : ""}`
    + `<div class="dl" ${mark.slot("day-label")}>${escape(label)}${pageExtra}</div><h1 class="tt" ${mark.slot("title")}>${escape(c.title)}</h1>`
    + `<p class="st" ${mark.slot("subtitle")}>${escape(c.subtitle)}</p>`
    + (work ? `<p class="sw"><b ${mark.slot("work-line")}>${escape(work)}</b></p>` : "")
    + (c.level <= 3 && c.grownUp ? `<p class="gu" ${mark.slot("grown-up")}><b>For the grown-up:</b> ${escape(c.grownUp)}</p>` : "") + `</header>`;
  // A Challenge block takes the free room of its page: its work boxes grow into it (DESIGN.md section 4).
  // (A block's rows: the sum of its grids' --rows, so blocks grow by their rows too.)
  const blockRows = (html: string) => [...html.matchAll(/class="(?:two|cols|list|facts|pcards|pcards fill|mxs)" style="--rows:(\d+)"/g)].reduce((n, m) => n + Number(m[1]), 0) || 1;
  const blocks = c.blocks.map((b, i) => {
    let html = blockHtml(b, i, ctx);
    const partialExtra = b.extra && !wholePageExtra;
    if (partialExtra) {
      // Label the visible optional group, never the shared page-type chip row.
      const badge = `<span data-measure="chipbadge-extra-${i}" class="chip c-rv c-extra-inline"><span>Extra</span></span>`;
      if (/<(?:div|span) class="lab"[^>]*>/.test(html)) html = html.replace(/(<(div|span) class="lab"[^>]*>[\s\S]*?)(<\/\2>)/, `$1${badge}$3`);
      else if (html.includes('<div class="chiprow">')) html = html.replace(/(<div class="chiprow"><span)( class="chip [^"]+">[\s\S]*?<span>)([^<]*)(<\/span>)/,
        (_tag, open: string, body: string, title: string, close: string) => `${open} data-measure="chipbadge-extra-${i}"${body}Extra block: optional · ${title}${close}`);
      else html = `<div class="lab">${badge}</div>${html}`;
    }
    // Teaching panels already enclose their content. Other optional blocks need a visible boundary around all sections.
    const outline = partialExtra && !["worked-example", "watch-one", "reminder"].includes(b.slot);
    return [b, i, html, outline] as const;
  }).map(([b, i, html, outline]) => `<section class="blk${outline ? " optional-block" : ""}${GROW.has(b.slot) || c.consistentLayout && b.slot === "word-problems" ? " grow" : ""}" style="--rows:${blockRows(html)}${b.slot === "in-your-head" ? `;flex:0 0 auto` : ""}" data-slot="${b.slot}" data-measure="block-${i}">${html.replace(/<div class="chiprow">([\s\S]*?)<\/div>/g, (_row, inner: string, at: number) => `<div class="chiprow" data-measure="chip-${i}-${at}">${inner.replace('<span class="chip ', `<span data-measure="chipbadge-${i}-${at}" class="chip `).replace('<span class="side">', `<span data-measure="chipnote-${i}-${at}" class="side">`)}</div>`).replace(/<div class="lab"([^>]*)>/g, (tag, attrs: string, at: number) => attrs.includes("data-measure") ? tag : `<div class="lab" data-measure="label-${i}-${at}"${attrs}>`).replace(NUMBER_SPAN, (_tag, cls: string, n: string) => `<span class="${cls}" data-measure="number-${n}">${n}.</span>`).replace(FRAME, (_tag, cls: string, at: number) => `<div class="${cls}" data-measure="frame-${i}-${at}"`)}${missingHtml(b)}</section>`).join("");
  // Finished rows share the remaining page space. Two-method pages keep their explicit writing allocation unless
  // their existing plan requires stretching. No new question or answer enters this rendering step.
  const stretch = c.consistentLayout && c.fillingComplete && (c.atMaximum || !c.blocks.some(b => b.slot === "solve-it-two-ways")) ? " stretch" : "";
  const lesson = expandedLesson(page) ? " expanded-lesson" : "";
  return `<div class="pg ${band.name}${lesson}${c.consistentLayout ? " consistent" : ""}${c.extraPractice && c.level >= 19 ? " older-extra" : ""}${stretch} f-${familyOf(page, c)}" data-page-type="${page.type}" style="--work-min:${c.consistentLayout ? workMinimum(c.level) : 64}px">${scanMarks}<div class="frame">${header}<main class="ct" style="--extra-gap:${Math.max(0,Math.min(48,c.extraGap ?? 0))}px" ${mark.slot("content")}>${blocks}</main></div>${footer(page, parts, c.id)}</div>`;
}

/** Each question's printed number ("3."), marked for the layout checks (src/lib/workbook-layout-check.ts). */
const NUMBER_SPAN = /<span class="(n|gn|badge|sn)">(\d+)\.<\/span>/g;

/** The outlined and shaded boxes that hold questions (Now it's your turn, Spot the error, Mental math, Fix it). */
const FRAME = /<div class="(outl|panel p-hd|panel p-fx)"/g;

/** A failed question with nothing to print: a red placeholder with its number and why (review drafts only). */
const missingHtml = (b: Block) => (b.missing ?? []).map((m) =>
  `<div class="qfail" data-failed-question="${m.number}" style="border:2px dashed #B42318;background:#FDECEA;color:#B42318;border-radius:8px;padding:8px 12px;font:600 13px/1.4 Helvetica,Arial,sans-serif;margin-top:8px">Question ${m.number} failed: ${escape(m.reason)}</div>`).join("");

const UNICA_MARK = `<div class="mk"><i class="y"></i><i></i><i class="b"></i><i></i><i class="o"></i><i></i><i class="g"></i><i></i><i></i></div>`;

/**
 * The level's plain name from the curriculum data ("Big numbers and multiplication facts" for U16), printed on the cover
 * after "Level U16" (Savar, 2026-11-09). A cover stores no curriculum key: BC is the only curriculum, so a stored book
 * gets the name at its next layout redraw.
 */
export const coverLevelName = (level: number): string | null => curriculumFor("bc")?.level(`U${level}`)?.title ?? null;

/**
 * The longest "Made for" line that keeps the level's name: two lines of `.cv .for` (688 px at 22 px) held 101 characters
 * of a name of m and w in Chromium, and 117 of real names (2026-11-09, U18). A longer line leaves the name out, so a long
 * child's name (the database takes 60 characters) never needs a third line; the fit check stays the backstop.
 */
export const COVER_FOR_CHARS = 96;

/** The cover's "Made for" line: "Made for {child} · Level U{n} · {level name}", without the name when it would not fit. */
export function coverForLine(child: string, level: number): string {
  const short = `Made for ${child} · Level U${level}`, levelName = coverLevelName(level);
  const full = levelName ? `${short} · ${levelName}` : short;
  return full.length <= COVER_FOR_CHARS ? full : short;
}

function coverPage(page: DraftPage, parts: PageParts, c: Extract<PageContent, { kind: "cover" }>, book: WorkbookDraft): string {
  const name = coverName(c.child);
  const label = c.madeFrom === "assessment" ? `Made from ${name}'s assessment` : `Made from ${name}'s last workbook`;
  const plan = book.pages.find(p => p.content?.kind === "how-plan")?.content;
  const topics = plan?.kind === "how-plan" ? [...new Set(plan.rows.map(row => row.topic))].slice(0, 3) : [];
  const path = topics.length ? `<section class="card cover-plan" ${mark.slot("cover-plan")}><span class="lab" ${mark.slot("cover-plan-label")}>From ${escape(name)}'s plan</span><ul>${topics.map((topic, i) => `<li ${mark.slot(`cover-topic-${i}`)}><i></i><span>${escape(topic)}</span></li>`).join("")}</ul></section>` : "";
  return `<div class="pg mid">${scanMarks}<div class="cv" ${mark.slot("page")}><div class="top">${wordmark}<span class="wn">Workbook ${c.workbook} · 10 days</span></div>${UNICA_MARK}`
    + `<div class="for" ${mark.slot("made-for")}>${escape(coverForLine(name, c.level))}</div>`
    + `<h1 ${mark.slot("cover-title")}>${escape(c.title[0])}<br><span class="hl">${escape(c.title[1])}</span></h1>`
    + `<div class="card made" ${mark.slot("made-from")}><span class="lab">${escape(label)}</span><p>${escape(c.sentence.replaceAll(c.child, name))}</p></div>${path}`
    + `</div>${footer(page, parts, c.id)}</div>`;
}

function howPlanPage(page: DraftPage, parts: PageParts, c: Extract<PageContent, { kind: "how-plan" }>, book: WorkbookDraft): string {
  const times = new Map(c.rows.flatMap(r => {
    const pages = book.pages.filter(p => p.content?.kind === "day" && !p.content.extraPractice && p.content.day === r.day);
    if (!pages.some(p => p.content?.kind === "day" && (p.content.requiredTimeTarget !== undefined || p.content.blocks.some(b => b.extra))))
      return r.requiredMinutes === undefined ? [] : [[r.day, { requiredMinutes: r.requiredMinutes, hasExtra: !!r.extra }] as const];
    return [[r.day, generatedDayTime(pages)] as const];
  }));
  const extra = [...times.values()].some(t => t.hasExtra);
  // Match the gate's tolerance: floating-point noise at 20 minutes must not print 21.
  const roundedMinutes = (minutes: number) => Math.ceil(minutes - 1e-9);
  const rows = c.rows.map((r) => {
    const time = times.get(r.day);
    return `<tr><td class="d">Day ${r.day}</td><td><span class="tp" ${mark.slot(`day-${r.day}`)}><b>${escape(r.topic)}</b><span class="t2">${escape(reviewTopic(r.second))}</span></span></td>`
    + `<td class="pp">${r.pages[0]}–${r.pages[1]}${time ? `<span class="plan-time" ${mark.slot(`required-time-${r.day}`)}>${roundedMinutes(time.requiredMinutes)} min</span>` : ""}</td><td class="dn"><i class="tb"></i></td></tr>`;
  }).join("");
  const how = [
    { chip: { label: "5 days a week", cls: "c-pr", icon: ICONS.target }, text: times.size ? `Do the days in order, 5 days a week. About ${roundedMinutes(Math.max(...[...times.values()].map(t => t.requiredMinutes)))} minutes a day${extra ? ", plus Extra if there's time" : ""}.` : `Do the days in order, 5 days a week. ${c.minutes.min === c.minutes.max ? `About ${c.minutes.max}` : `${c.minutes.min} to ${c.minutes.max}`} minutes a day.` },
    { chip: { label: "Scan", cls: "c-mx", icon: ICONS.search }, text: "Sign in at unicalearning.com/account, then choose Scan pages." },
    { chip: { label: "Stuck?", cls: "c-ni", icon: ICONS.book }, text: "Ask for help using Maya, the AI Teaching Assistant." },
    { chip: { label: "Fix it", cls: "c-fx", icon: ICONS.wrench }, text: c.workbook === 1 ? "Scan finished pages. Questions your child needs to practise can return in the next workbook." : "Anything your child got wrong in the previous workbook comes back as new questions." },
  ];
  return `<div class="pg mid">${scanMarks}<div class="hp" ${mark.slot("page")}><div class="top"><span>HOW IT WORKS · ${escape(c.child.toUpperCase())}'S PLAN</span><span>WORKBOOK ${c.workbook}</span></div>`
    + `<table><thead><tr><th style="width:96px">DAY</th><th>TOPIC</th><th style="width:96px">PAGES${times.size ? "<br>REQUIRED TIME" : ""}</th><th style="width:56px;text-align:right">DONE</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<div class="how"><span class="lab">How it works</span><div class="hw">${how.map((h, i) => `<div>${chipHtml(h.chip)}<p ${mark.slot(`how-${i}`)}>${escape(h.text).replace("unicalearning.com/account", `<span class="scan-address" ${mark.slot("scan-address")}>unicalearning.com/account</span>`)}</p></div>`).join("")}</div></div>`
    + `</div>${footer(page, parts, c.id)}</div>`;
}

function blankPage(page: DraftPage, parts: PageParts, c: Extract<PageContent, { kind: "blank" }>): string {
  return `<div class="pg mid">${scanMarks}${footer(page, parts, c.id)}</div>`;
}

// ---------- The fit check ----------

const bottomOf = (m: MeasuredElement) => m.y + m.height;
/** The area two rects share, in square CSS pixels. */
const overlap = (a: MeasuredElement, b: MeasuredElement) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const where = (page: DraftPage, c: DayContent) => `day ${c.day} page ${c.page} (${page.type})`;

/** Union of occupied vertical intervals. Gaps never count as content. */
export function pageSpace(page: DraftPage, measured: ReadonlyMap<string, MeasuredElement>): { fraction: number; empty: number; largestGap: number; bottom: number; span: number } | null {
  const area = measured.get("slot-content");
  const bounds = page.questions.map(q => measured.get(`question-${q.number}`));
  if (!area?.visible || area.clientHeight <= 0 || bounds.length === 0 || bounds.some(m => !m?.visible)) return null;
  const panels = page.content?.kind === "day" ? page.content.blocks.flatMap((b, i) => ["worked-example", "watch-one", "reminder"].includes(b.slot) ? [measured.get(`block-${i}`)] : []) : [];
  if (panels.some(m => !m?.visible)) return null;
  const headings=[...measured].filter(([name])=>/^(?:chip|heading|label)-/.test(name)).map(([,m])=>m);
  const rows = ([...bounds, ...panels, ...headings] as MeasuredElement[]).map(m => [Math.max(area.y,m.y),Math.min(area.y+area.clientHeight,bottomOf(m))]).sort((a,b)=>a[0]-b[0]);
  const merged: number[][] = [];
  for (const row of rows) {
    const last=merged.at(-1);
    if (last && row[0]<=last[1]) last[1]=Math.max(last[1],row[1]); else merged.push(row);
  }
  const occupied=merged.reduce((n,[from,to])=>n+Math.max(0,to-from),0);
  const gaps=merged.slice(1).map((row,i)=>row[0]-merged[i][1]);
  return {fraction:occupied/area.clientHeight,empty:area.clientHeight-occupied,largestGap:Math.max(0,...gaps),bottom:area.y+area.clientHeight-merged.at(-1)![1],span:(merged.at(-1)![1]-merged[0][0])/area.clientHeight};
}

export function pageFullness(page: DraftPage, measured: ReadonlyMap<string, MeasuredElement>): number | null {
  return pageSpace(page,measured)?.fraction ?? null;
}

export function fullnessProblem(page: DraftPage, measured: ReadonlyMap<string, MeasuredElement>): string | null {
  const holes = pagePlan(page)?.incomplete ?? [];
  if (holes.length) return `The question grid has an empty cell beside question ${holes[0]}; complete the row.`;
  const use=pageSpace(page,measured);
  if (!use) return "The page fullness could not be measured.";
  if (use.largestGap>60.5) return `The page has a ${Math.round(use.largestGap)} px unoccupied gap; allow 12 px plus at most 48 px extra.`;
  // Never a gap at the bottom (Savar, 2026-11-04: "space for another question"): a page fills, or spreads its rows.
  // (60 px, or less where the page's rows are shorter: room for another row is never left, src/lib/workbook-layout-check.ts.)
  if (page.content?.kind==="day" && use.bottom>bottomGapLimit(page,measured)+.5) return `The page leaves ${Math.round(use.bottom)} px empty at the bottom; add a question, or spread the rows evenly.`;
  if (use.fraction>=.85) return null;
  // At the page maximum, Cedric permits evenly distributed spacing. Report the
  // true occupied fraction separately; never relabel a gap as occupied space.
  if (page.content?.kind==="day" && page.content.fillingComplete && use.span>=.92) return null;
  return `Questions and teaching panels occupy ${Math.round(100*use.fraction)}% of the page height; add an item up to the page maximum, then spread gaps by at most 48 px.`;
}

/** The template's fit check of a laid-out day page (see the header). */
export function fitProblems(page: DraftPage, measured: ReadonlyMap<string, MeasuredElement>): FitProblem[] {
  const c = page.content;
  if (!c || c.kind !== "day") return [];
  const band = bandOf(c.level);
  const at = where(page, c);
  const problems: FitProblem[] = [];
  // A chip never covers its note (#482 review at db3b1a0: the Practice badge over "Read the example").
  for (const [name, badge] of measured) {
    if (!name.startsWith("chipbadge-")) continue;
    const note = measured.get(name.replace("chipbadge-", "chipnote-"));
    // (The note starting inside the badge's width; an unmeasured pair sits at one point.)
    if (note?.visible && badge.visible && badge.width > 0 && note.x > badge.x && note.x < badge.x + badge.width - 0.5) problems.push({ question: null, slot: null, reason: `${at}: a chip covers its note` });
  }
  if(c.consistentLayout) c.blocks.forEach((b,i)=>{
    if (!["worked-example","watch-one","reminder"].includes(b.slot)) return;
    const panel=measured.get(`panel-${i}`);
    // (U4 to U9 print larger: a worked example with its method line takes up to 320 px there.)
    const max=b.slot === "reminder" ? 160 : c.level <= 9 ? 320 : 260;
    if(!panel?.visible || panel.height>max+.5) problems.push({question:null,slot:b.slot,reason:`${at}: the ${b.slot} panel must fit ${max} px`});
  });
  c.blocks.forEach((b) => {
    const max = slotMax(b.slot, c);
    if (b.items.length > max) problems.push({ question: null, slot: b.slot, reason: `${at}: the ${b.slot} slot holds ${b.items.length} items; it takes at most ${max}` });
  });

  // Overflow: the first question pushed past the bottom of the content area in each slot, or the slot itself.
  const area = measured.get("slot-content");
  if (area) {
    const limit = area.y + area.clientHeight + 0.5;
    c.blocks.forEach((b, i) => {
      const out = b.items.map((n) => ({ n, m: measured.get(`question-${n}`) })).find((x) => x.m && bottomOf(x.m) > limit);
      if (out) {
        problems.push({ question: out.n, slot: b.slot, reason: `${at}: question ${out.n} in the ${b.slot} slot runs ${Math.ceil(bottomOf(out.m!) - limit)} px past the bottom of the content area` });
        return;
      }
      const block = measured.get(`block-${i}`);
      if (block && bottomOf(block) > limit) problems.push({ question: null, slot: b.slot, reason: `${at}: the ${b.slot} slot runs ${Math.ceil(bottomOf(block) - limit)} px past the bottom of the content area` });
    });
  }

  // The title (D-201): at most 4 words, on one line, measured on the page. A title that breaks it is never printed.
  const wordy = titleProblem(c.title);
  if (wordy) problems.push({ question: null, slot: "title", reason: `${at}: ${wordy}` });
  // It never wraps (white-space: nowrap), so a title too long for one line runs past the column's width.
  const title = measured.get("slot-title");
  if (!title || !title.visible || !title.textPrinted || title.clientWidth <= 0 || title.clientHeight <= 0) {
    problems.push({ question: null, slot: "title", reason: `${at}: the page title was not printed or measured` });
  } else if (title.scrollWidth > title.clientWidth + 1 || title.scrollHeight > title.clientHeight + 1) {
    problems.push({ question: null, slot: "title", reason: `${at}: the page title "${c.title}" does not fit on one line` });
  }

  const instruction = measured.get("slot-subtitle");
  if (instructionProblem(c.subtitle) || !instruction?.visible || !instruction.textPrinted || instruction.scrollHeight > instruction.clientHeight + 1 || instruction.scrollWidth > instruction.clientWidth + 1)
    problems.push({ question: null, slot: "subtitle", reason: `${at}: the page instruction is missing or does not fit` });
  if (c.level === 16 && c.consistentLayout && instruction?.text.trim() !== c.subtitle)
    problems.push({ question: null, slot: "subtitle", reason: `${at}: the printed instruction does not match the page's answer and work regions` });
  // The work line prints in full on its one line, naming the page's questions with work space.
  const workText = workbookWorkLine(page), workLine = measured.get("slot-work-line");
  if (workText && (!workLine?.visible || !workLine.textPrinted || workLine.text.trim() !== workText
    || workLine.scrollHeight > workLine.clientHeight + 1 || workLine.scrollWidth > workLine.clientWidth + 1))
    problems.push({ question: null, slot: "work-line", reason: `${at}: the work line is missing or does not fit` });
  if (c.level > 3 && c.grownUp) problems.push({ question: null, slot: "grown-up", reason: `${at}: grown-up text is only for Kindergarten` });
  if (c.page !== 1 && measured.has("slot-name-date")) problems.push({ question: null, slot: "name-date", reason: `${at}: name and date belong only on the first page` });

  // A card's question text (D-201): at most CARD_LINES lines, so a story in full sentences never runs over its card.
  for (const b of c.blocks) {
    if (!(band.name === "parent" || ["picture-stories", "fix-it", "show-what-you-know", "level-test", "challenge"].includes(b.slot))) continue;
    for (const n of b.items) {
      const m = measured.get(`question-${n}-content`);
      const lines = m ? Math.round(m.height / (band.body * 1.4)) : 0;
      if (lines > CARD_LINES) problems.push({ question: n, slot: b.slot, reason: `${at}: question ${n}'s text takes ${lines} lines on its card; a card has room for ${CARD_LINES}` });
    }
  }

  // Writing space: answer boxes by the band, work boxes, writing lines; and no box or choice over its own text.
  const slotOf = (n: number) => c.blocks.find((b) => b.items.includes(n))?.slot ?? null;
  for (const q of page.questions) {
    const feedback = feedbackItemProblem(q.package);
    if (feedback) problems.push({ question: q.number, slot: slotOf(q.number), reason: `${at}: ${feedback}` });
    const content = measured.get(`question-${q.number}-content`);
    for (const { region, name } of regionNames(q)) {
      const m = measured.get(name);
      if (!m) continue;
      if (content && (region.kind === "box" || region.kind === "choice") && overlap(m, content) > 1) {
        problems.push({ question: q.number, slot: slotOf(q.number), reason: `${at}: question ${q.number}'s ${region.kind === "box" ? "answer box covers" : "choices cover"} its own text` });
      }
      const small = (what: string, size: number, min: number) =>
        problems.push({ question: q.number, slot: slotOf(q.number), reason: `${at}: question ${q.number}'s ${what} is ${Math.floor(size)} px; the design allows no less than ${min}` });
      if (region.kind === "box") {
        const minimum=c.consistentLayout ? c.level<=3 ? 56 : 48 : band.box;
        if (m.height < minimum - 0.5) small("answer box height", m.height, minimum);
        if (m.width < (c.consistentLayout ? 48 : ANSWER_MIN) - 0.5) small("answer box width", m.width, c.consistentLayout ? 48 : ANSWER_MIN);
      } else if (region.kind === "work") {
        const grid = ["remember-these", "now-you", "finish-these", "on-your-own", "practice-row", "unit-b-practice", "mixed-set", "friday-5"].includes(slotOf(q.number) ?? "");
        const minimum = c.consistentLayout ? slotOf(q.number) === "solve-it-two-ways" ? Math.max(102, questionWorkSpace(q.package) + 38) : grid ? Math.max(32, questionWorkSpace(q.package)) : workMinimum(c.level) : WORK_MIN;
        if (m.height < minimum - .5) small("work box height", m.height, minimum);
      }
      else if (region.kind === "lines" && m.height < LINE_FIRST + LINE_NEXT * (LINES - 1) - 0.5) small("writing space", m.height, LINE_FIRST + LINE_NEXT * (LINES - 1));
    }
  }
  return problems;
}

// ---------- The template ----------

/** The workbook templates (see the header), with Geist and Geist Mono embedded when given. */
export function workbookTemplate(fonts?: TemplateFonts): WorkbookTemplate {
  return {
    css: (fonts ? fontFace("Unica Sans", "300 700", fonts.sans) + fontFace("Unica Mono", "400 500", fonts.mono) : "") + CSS,
    page(page, parts, book) {
      page = printedPage(page);
      const c = page.content;
      if (!c) return null;
      switch (c.kind) {
        case "day": return dayPage(page, parts, c);
        case "cover": return coverPage(page, parts, c, book);
        case "how-plan": return howPlanPage(page, parts, c, { ...book, pages: book.pages.map(printedPage) });
        case "back-cover": return blankPage(page, parts, { ...c, kind: "blank" });
        case "blank": return blankPage(page, parts, c);
      }
    },
    // (With the layout checks of Savar's page reviews: spacing, alignment, one number style, no repeated instruction,
    // no clipped text.)
    fit: (page, measured) => {
      const printed = printedPage(page);
      const address = measured.get("slot-scan-address");
      const addressProblem: FitProblem[] = printed.content?.kind === "how-plan" && (!address?.visible || !address.textPrinted
        || address.text.trim() !== "unicalearning.com/account"
        || address.firstLine && address.height > address.firstLine.height * 1.7)
        ? [{ question: null, slot: "scan-address", reason: "the scan address must print in full on one line" }] : [];
      return [...fitProblems(printed, measured), ...layoutProblems(printed, measured, pagePlan(printed)), ...addressProblem];
    },
    answerMin: ANSWER_MIN,
  };
}

