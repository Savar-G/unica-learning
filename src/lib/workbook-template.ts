// The workbook templates (#310, spec #296): one layout for every page type of .design/workbooks/DESIGN.md (section
// 7), with its tokens (section 1 to 4): the 8-page and 6-page days, Math in the world, the cover, How + Plan, the back
// cover with its level map, Friday 5, Show what you know, the level test, parent-led U1 to U3 pages, the early-level
// Remember these? pages and Challenge cards, every page with its footer (QR code, page ID, book page number,
// wordmark) and four scan marks. Blank pages pad the book at the end.
//
// A page's content comes as data (src/lib/workbook-page.ts): its header and its named slots, each with its questions.
// The template owns every position, size, colour and font. The day label, title and subtitle wrap to a second line at
// a word break; a third line, or a word wider than the column, fails the render (never cut). The type ramp is fixed per level band (U1 to U3, U4 to U9,
// U10 and up; DESIGN.md section 2); nothing is shrunk to fit. Its fit check (`fit`) fails a page whose content runs
// past the content area (naming the slot and the first question pushed out), a slot holding more items than it takes,
// an answer box smaller than the band allows, an answer box or choices over the question's own text, a work box under
// 44 px or writing lines closer than 36 px under their prompt and 34 px apart.
// Pure TypeScript: no Next.js, React, network, database or clock.
import { packageItem, valueText, type AnswerRegion, type AnswerValue, type QuestionPackage } from "@/lib/question-package";
import type { Block, DayContent, Figure, PageContent, SlotName, WorkedLine } from "@/lib/workbook-page";
import {
  mark,
  type DraftPage,
  type DraftQuestion,
  type FitProblem,
  type MeasuredElement,
  type PageParts,
  type WorkbookTemplate,
} from "@/lib/workbook-render";
import type { TemplateFonts } from "@/lib/workbook-template-fixed";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fontFace = (family: string, weights: string, woff2: Uint8Array) =>
  `@font-face{font-family:"${family}";font-weight:${weights};src:url(data:font/woff2;base64,${Buffer.from(woff2).toString("base64")}) format("woff2")}`;

// ---------- Level bands ----------

/** The type ramp and box sizes of a level band (DESIGN.md section 2, minimum sizes by level; section 7.3). */
interface Band {
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
  mid: { name: "mid", title: 30, body: 15, small: 13, fact: 17, math: 15, column: 22, number: 14, story: 15, box: 40 },
  // U4 to U9: 18 px at least; bigger maths in facts (30 to 34).
  early: { name: "early", title: 36, body: 20, small: 18, fact: 30, math: 20, column: 28, number: 18, story: 20, box: 48 },
  // U1 to U3: 20 px body, boxes at least 56.
  parent: { name: "parent", title: 36, body: 20, small: 18, fact: 32, math: 22, column: 30, number: 18, story: 20, box: 56 },
};
export const bandOf = (level: number): Band => BANDS[level <= 3 ? "parent" : level <= 9 ? "early" : "mid"];

/** Writing lines: the first at least 36 px under its prompt, the next at least 34 px under it (DESIGN.md section 4). */
const LINE_FIRST = 36;
const LINE_NEXT = 34;
const LINES = 2;
/** The smallest work box: the inline Mixed set box. */
const WORK_MIN = 44;
/** The smallest answer box each way at any level (CONTEXT.md section 6). */
export const ANSWER_MIN = 40;

// ---------- Slot limits (DESIGN.md section 7: maximums for the 688 by 720 content area) ----------

/** The most items a slot takes on a page. */
export function slotMax(slot: SlotName, c: Pick<DayContent, "level" | "pages">): number {
  const band = bandOf(c.level);
  const six = c.pages <= 6 && band.name === "mid";
  switch (slot) {
    case "warm-up": return band.name === "mid" ? (six ? 27 : 30) : 8;
    case "fix-it": return 3;
    case "in-your-head": case "try-first": case "spot-the-error": case "solve-it-two-ways": case "how-do-you-know": return 1;
    case "remember-these": return band.name === "parent" ? 6 : 8;
    case "now-you": return 4;
    case "finish-these": return 2;
    case "on-your-own": return band.name === "mid" ? 8 : 6;
    case "practice-row": return 4;
    case "word-problems": return 3;
    case "unit-b-practice": return 8;
    case "mixed-set": return 4;
    case "picture-stories": return 6;
    case "friday-5": return 5;
    case "challenge": return 2;
    case "math-in-the-world": return 3;
    // Cards with a work area of at least 44 px: 5 rows of 2 from U10, 4 rows at U4 to U9.
    case "show-what-you-know": return band.name === "mid" ? 10 : 8;
    case "level-test": return band.name === "mid" ? 10 : 8;
    case "unit-check": return 4;
    case "mini-test": return 5;
    case "already-know-it": return 10;
    case "worked-example": case "watch-one": case "reminder": return 0;
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
.pg.mid{--title:30px;--body:15px;--small:13px;--fact:17px;--math:15px;--col:22px;--num:14px;--story:15px;--box:40px}
.pg.early{--title:36px;--body:20px;--small:18px;--fact:30px;--math:20px;--col:28px;--num:18px;--story:20px;--box:48px}
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
.nd{display:flex;align-items:flex-end;gap:8px;height:18px;font-size:13px;line-height:18px}
.nd .r1{display:block;width:483px;border-bottom:1px solid #0C0C0E;height:14px}
.nd .r2{display:block;flex:1;border-bottom:1px solid #0C0C0E;height:14px}
.dl{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:var(--small);line-height:1.2;letter-spacing:.04em;text-transform:uppercase;max-height:calc(var(--small)*2.4);overflow:hidden}
.tt{margin:2px 0 0;font-weight:300;font-size:var(--title);line-height:1.25;padding-bottom:2px;max-height:calc(var(--title)*2.5 + 3px);overflow:hidden}
.st{margin:0;font-size:var(--body);color:#44444C;max-height:calc(var(--body)*2.8);overflow:hidden}
.gu{margin:0;font-size:var(--body);color:#0C0C0E;background:#F4F4F5;border-radius:8px;padding:6px 12px;overflow:hidden}
.gu b{font-weight:500}
.ct{flex:1 1 auto;flex-shrink:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:12px}
.ct>*{flex-shrink:0}
.blk{display:flex;flex-direction:column;gap:8px}
.blk.grow{flex-grow:1}
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
.chip{display:inline-flex;align-items:center;gap:8px;height:28px;padding:6px 10px;border-radius:999px;font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:var(--small);line-height:1.2;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
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
.side{font-size:var(--small);color:#44444C}
.lab{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:var(--small);line-height:1.2;letter-spacing:.04em;text-transform:uppercase;color:#44444C}
.blue{color:#2453D4}
.n{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:var(--num);line-height:1.2;min-width:22px;flex:none}
.qt{font-size:var(--body)}
.qm{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:var(--math);white-space:nowrap}
/* answer regions */
.ab{display:inline-block;height:var(--box);min-width:var(--box);border:1.2px solid #0C0C0E;border-radius:6px;background:#fff;flex:none;vertical-align:middle}
.rg{display:inline-flex;align-items:center;gap:8px;flex:none}
.rg .rl{font-size:var(--small);color:#44444C}
.rg .rl.box{font-family:"Unica Mono",ui-monospace,Menlo,monospace;letter-spacing:.04em;text-transform:uppercase}
.unit{font-size:var(--body)}
.strip{display:inline-flex;align-items:center;gap:28px;height:42px;padding:8px 14px;background:#F4F4F5;border-radius:8px;flex:none}
.pg.early .strip,.pg.parent .strip{height:56px}
.strip .ch{display:inline-flex;align-items:center;gap:8px;font-size:16px}
.pg.early .strip .ch,.pg.parent .strip .ch{font-size:var(--body)}
.tb{display:inline-block;width:20px;height:20px;border:2px solid #0C0C0E;border-radius:3px;background:#fff}
.pg.early .tb,.pg.parent .tb{width:26px;height:26px}
.t1{display:inline-flex;align-items:center;gap:6px;font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:13px;color:#44444C;flex:none}
.pg.early .t1,.pg.parent .t1{font-size:var(--small)}
.t1 i{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:1.5px solid #0C0C0E;border-radius:2px;font-style:normal;font-size:12px;color:#0C0C0E;line-height:1}
.circ{display:inline-flex;align-items:center;gap:36px;min-height:56px;padding:6px 18px;flex:none}
.circ .co{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:var(--fact)}
.wb{display:block;border:1px solid #D4D4DA;border-radius:8px;padding:10px 12px;background:#fff;flex:1 1 auto;min-width:120px}
.wb .lab{font-weight:400;color:#44444C}
.ln{display:block;width:100%}
.ln .lp{font-size:var(--body);height:calc(var(--body)*1.4)}
.ln i{display:block;border-bottom:1px solid #9A9AA2;height:${LINE_NEXT}px}
.ln i:first-of-type{height:${LINE_FIRST}px}
.pic{display:block;flex:none}
.picr{display:inline-block;flex:none}
.nl{position:relative;flex:none}
.nlv{position:absolute;transform:translateX(-50%);font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:14px;line-height:1}
.draw{display:block;width:100%;height:140px;border:1px dashed #CCCCD1;border-radius:8px}
/* items */
.q{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.q .qb{flex:1 1 0;min-width:min-content}
.q .rgs{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.q .full{flex-basis:100%;display:flex;gap:12px}
.list{display:flex;flex-direction:column;gap:6px}
.two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:32px;row-gap:6px}
.facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:24px;row-gap:12px}
.pg.early .facts,.pg.parent .facts{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:48px;row-gap:22px}
.facts .q{gap:10px;flex-wrap:nowrap}
.facts .gn{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:var(--small);color:#44444C;min-width:22px;flex:none}
.facts .qm{font-size:var(--fact);flex:1 1 auto;white-space:nowrap}
.cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 16px}
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
.outl{border:1.5px solid #3366F0;border-radius:12px;padding:12px 20px 14px;background:#fff;display:flex;flex-direction:column;gap:8px}
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
.story .act .wb{height:88px}
.mxs{display:flex;flex-direction:column;gap:6px}
.mx{display:flex;flex-direction:column;gap:2px;padding-top:6px;border-top:1px solid #D4D4DA}
.mx .qt{font-size:14px;line-height:1.3}
.mx .strip{height:40px;gap:20px}
.pg.early .mx .qt{font-size:var(--story)}
.mx .stp{display:flex;align-items:center;gap:12px}
.mx .sb{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#0C0C0E;color:#fff;font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:13px;line-height:1;flex:none}
.mx .sl{font-size:var(--body);min-width:150px}
.mx .wb{height:44px;display:flex;align-items:center}
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
.pcards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.pcard{border:1px solid #D4D4DA;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.pcard .pb{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}
.pcard .pb>.pic{max-width:60%;height:auto}
.pcard .draw{height:56px;width:150px}
.pcard .head{display:flex;gap:10px;align-items:center}
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
.made{margin-top:28px;background:#FFF1EA;border:1.5px solid #FF6A3D;border-radius:10px;padding:22px 24px;display:flex;flex-direction:column;gap:14px;height:268px;overflow:hidden}
.made .lab{font-size:12px;color:#0C0C0E}
.made p{margin:0;font-size:17px}
.made ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}
.made li{display:flex;gap:12px;align-items:baseline;font-size:15px}
.made li i{display:block;width:8px;height:8px;background:#FF6A3D;flex:none;transform:translateY(-1px)}
.cv .pl{margin:24px 0 0;font-size:15px;height:42px;overflow:hidden}
.cv .nx{margin:auto 0 0;font-size:15px;color:#44444C;height:21px;overflow:hidden;white-space:nowrap}
/* how + plan */
.hp{position:absolute;left:64px;top:64px;width:688px;height:866px;display:flex;flex-direction:column;overflow:hidden}
.hp .top{display:flex;justify-content:space-between;font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:12px;letter-spacing:.04em}
.hp table{margin-top:18px;width:100%;border-collapse:collapse;table-layout:fixed}
.hp th{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:11px;letter-spacing:.04em;color:#44444C;text-align:left;padding:0 0 8px;border-bottom:1px solid #0C0C0E}
.hp td{height:56px;border-bottom:1px solid #E0E0E5;padding:0;vertical-align:middle}
.hp .d{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-weight:500;font-size:16px;width:96px}
.hp .tp{display:block;height:50px;overflow:hidden;padding-top:4px}
.hp .tp b{display:block;font-weight:500;font-size:18px;line-height:1.3;white-space:nowrap}
.hp .tp .t2{display:block;font-size:14px;color:#44444C;white-space:nowrap}
.hp .pp{font-family:"Unica Mono",ui-monospace,Menlo,monospace;font-size:16px;width:96px}
.hp .dn{width:56px;text-align:right}
.hp .how{margin-top:auto;border-top:1px solid #0C0C0E;padding-top:14px;display:flex;flex-direction:column;gap:12px}
.hp .hw{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.hp .hw p{margin:8px 0 0;font-size:14px}
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
  ear: svg(`<path d="M5 6a3 3 0 1 1 6 0c0 2-2 2.5-2 4.5a2 2 0 0 1-3.5 1.3M7 6.5a1 1 0 1 1 2 0"/>`),
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
  "remember-these": { label: "Remember these", cls: "c-rv" },
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
  // The Challenge page's subtitle says "One (or two) to stretch you."; its chip has no note.
  "warm-up": "Do as many as you can.",
  "spot-the-error": "One move is wrong. Find it, then write the fix.",
  "mixed-set": "Tick the operation, then write the answer.",
  "friday-5": "5 from the last 3 weeks. No hints.",
  "show-what-you-know": "One of each, and the hardest ones again.",
  "level-test": "No hints. Do your best.",
};

const chipHtml = (chip: Chip, note?: string) =>
  `<div class="chiprow"><span class="chip ${chip.cls}">${chip.icon ?? ""}<span>${escape(chip.label)}</span></span>${note ? `<span class="side">${escape(note)}</span>` : ""}</div>`;

// ---------- Figures (drawn by code, DESIGN.md section 4 visual models) ----------

const COUNTER = ["#FF6A3D", "#3366F0", "#16A06A"];

export function figureSvg(f: Figure, scale = 1): string {
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
      const frames = f.filled > 10 ? 2 : 1;
      let body = "";
      for (let i = 0; i < 10 * frames; i++) {
        const cx = (i % 5) * 30 + Math.floor(i / 10) * 166;
        const cy = Math.floor((i % 10) / 5) * 30;
        body += `<rect x="${cx + 1}" y="${cy + 1}" width="30" height="30" fill="#fff" stroke="#0C0C0E" stroke-width="1.2"/>`;
        if (i < f.filled) body += `<circle cx="${cx + 16}" cy="${cy + 16}" r="10" fill="#3366F0"/>`;
      }
      return out(152 + (frames - 1) * 166, 62, body);
    }
    case "number-line": {
      // Labels are HTML over the drawing, not SVG text, so the print engine can check them like any text.
      const w = 320;
      const n = Math.round((f.to - f.from) / f.step);
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
const worked = (line: WorkedLine) => escape(line).replace(/\[([^\]]*)\]/g, `<span class="blue">$1</span>`);

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
function unitAfter(p: QuestionPackage): string {
  const v = p.answer?.value;
  if (v?.type === "quantity" && v.unit !== "$") return v.unit;
  return p.answer?.unit ?? "";
}

/** The measured name of each region of a question: the first box or choice is its answer space (renderer), the rest regions. */
export function regionNames(q: DraftQuestion): { region: AnswerRegion; name: string }[] {
  const regions = packageItem(q.package).regions;
  const first = Math.max(0, regions.findIndex((r) => r.kind === "box" || r.kind === "choice"));
  return regions.map((region, i) => ({ region, name: i === first ? `question-${q.number}-answer` : `region-${q.number}-${region.id}` }));
}

const measureAttr = (name: string) => `data-measure="${name}"`;

interface RegionOpts {
  band: Band;
  /** Work box height: a number, or "fill" for the rest of a card. */
  work?: number | "fill";
  /** Show a box region's label before it ("ANSWER", "a)"). */
  labels?: boolean;
  /** Leave out the unit word after a box (a parent-led card has no room; its question names the unit). */
  noUnits?: boolean;
  /** Writing lines with no label (the item's text is their prompt). */
  bare?: boolean;
  /** A picture region drawn as this figure (a parent-led card's squares to colour). */
  figure?: Figure | null;
}

function regionHtml(q: DraftQuestion, r: AnswerRegion, name: string, o: RegionOpts): string {
  const at = measureAttr(name);
  switch (r.kind) {
    case "box": {
      const label = o.labels && r.label ? `<span class="rl box">${escape(r.label)}</span>` : "";
      const unit = o.noUnits ? "" : unitAfter(q.package);
      const money = q.package.answer?.value.type === "quantity" && q.package.answer.value.unit === "$" ? `<span class="unit">$</span>` : "";
      return `<span class="rg">${label}${money}<span class="ab" ${at} style="width:${boxWidth(r.answer, o.band)}px"></span>${unit ? `<span class="unit">${escape(unit)}</span>` : ""}</span>`;
    }
    case "choice": {
      if (r.mark === "circle") return `<span class="circ" ${at}>${r.choices.map((c) => `<span class="co">${escape(c)}</span>`).join("")}</span>`;
      const choices = r.choices.map((c) => `<span class="ch"><i class="tb"></i><span>${escape(c)}</span></span>`).join("");
      return `<span class="rg">${r.label ? `<span class="rl">${escape(r.label)}</span>` : ""}<span class="strip" ${at}>${choices}</span><span class="t1"><span>Tick one</span><i>✓</i></span></span>`;
    }
    case "work": {
      const h = o.work === "fill" ? "" : `height:${o.work ?? 80}px`;
      return `<div class="wb" ${at} style="${h}"><span class="lab">${escape(r.label)}</span></div>`;
    }
    case "lines":
      // A written-reason item's prompt is its question text; the lines need no label of their own.
      return `<div class="ln" ${at}>${o.bare ? "" : `<div class="lp">${escape(r.label)}</div>`}${"<i></i>".repeat(LINES)}</div>`;
    case "picture":
      return o.figure ? `<div class="picr" ${at}>${figureSvg(o.figure)}</div>` : `<div class="draw" ${at}></div>`;
  }
}

/** The regions of a question that sit in a row (boxes, choices) and those that take the full width (work, lines, pictures). */
function regionsSplit(q: DraftQuestion, o: RegionOpts): { inline: string; full: string } {
  let inline = "";
  let full = "";
  for (const { region, name } of regionNames(q)) {
    const html = regionHtml(q, region, name, o);
    if (region.kind === "box" || region.kind === "choice") inline += html;
    else full += html;
  }
  return { inline, full };
}

/** The question's text, marked as its content. */
const text = (q: DraftQuestion, cls = "qt") => `<span class="${cls}" ${mark.questionContent(q.number)}>${escape(q.package.text)}</span>`;
const isMath = (s: string) => /^[\d\s+−×÷=?.,()/$¢a-z]*$/i.test(s) && /\d/.test(s) && !/[a-z]{3,}/i.test(s);
const qtext = (q: DraftQuestion) => text(q, isMath(q.package.text) ? "qm" : "qt");

/** A question in a line: its number, its text, its boxes at the right, then any work box or writing lines under it. */
function lineItem(q: DraftQuestion, band: Band, hint?: WorkedLine | null, work = 60, figure?: Figure | null): string {
  const pictured = packageItem(q.package).regions.some((r) => r.kind === "picture");
  const split = regionsSplit(q, { band, work, labels: true, bare: packageItem(q.package).format === "written-reason", figure: pictured ? figure : null });
  // A picture the child reads (dots to count, a pattern) sits under the question, before any work box.
  const inline = split.inline;
  const full = (figure && !pictured ? `<div class="picr">${figureSvg(figure)}</div>` : "") + split.full;
  return `<div class="q" ${mark.question(q.number)}><span class="n">${q.number}</span><span class="qb">${qtext(q)}${hint ? ` <span class="qm">${worked(hint)}</span>` : ""}</span>`
    + `<span class="rgs">${inline}</span>${full ? `<div class="full">${full}</div>` : ""}</div>`;
}

/** A fact in a grid: small grey number, the fact, the box. */
function factItem(q: DraftQuestion, band: Band): string {
  const { inline } = regionsSplit(q, { band });
  return `<div class="q" ${mark.question(q.number)}><span class="gn">${q.number}</span>${text(q, "qm")}${inline}</div>`;
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
  return `<div class="col" ${mark.question(q.number)}><span class="n">${q.number}</span><div class="sum"><div ${mark.questionContent(q.number)}><div class="row"><span>${a}</span></div><div class="row"><span class="op">${sign}</span><span>${b}</span></div></div><div class="rule">${box}</div></div></div>`;
}

/** A question in a card: number badge, text, its boxes, then work or lines. */
function cardItem(q: DraftQuestion, band: Band, work: number | "fill" = 80, cls = "card", figure?: Figure | null): string {
  const pictured = packageItem(q.package).regions.some((r) => r.kind === "picture");
  const split = regionsSplit(q, { band, work, labels: true, figure: pictured ? figure : null });
  const inline = split.inline;
  const full = (figure && !pictured ? `<div class="picr">${figureSvg(figure)}</div>` : "") + split.full;
  return `<div class="${cls}" ${mark.question(q.number)}><div class="q"><span class="badge">${q.number}</span><span class="qb">${qtext(q)}</span><span class="rgs">${inline}</span></div>${full ? `<div class="q" style="margin-top:10px">${full}</div>` : ""}</div>`;
}

/** A parent-led item: an icon, the short instruction the parent reads, a picture, the big answer. */
function parentItem(q: DraftQuestion, band: Band, figure: Figure | null | undefined): string {
  // A picture region is the figure itself (squares to colour); any other figure sits beside the answer.
  const pictured = packageItem(q.package).regions.some((r) => r.kind === "picture");
  const { inline, full } = regionsSplit(q, { band, work: 80, noUnits: true, figure: pictured ? figure : null });
  const icon = packageItem(q.package).regions.some((r) => r.kind === "choice") ? ICONS.pencil : ICONS.ear;
  return `<div class="pcard" ${mark.question(q.number)}><div class="head"><span class="badge">${q.number}</span><span class="ico">${icon}</span>${text(q)}</div>`
    + `<div class="pb">${figure && !pictured ? figureSvg(figure) : ""}<div class="q">${inline}${full}</div></div></div>`;
}

// ---------- Slots ----------

interface Ctx {
  page: DraftPage;
  c: DayContent;
  band: Band;
  q: (n: number) => DraftQuestion;
  six: boolean;
}

function blockHtml(b: Block, i: number, ctx: Ctx): string {
  const { band, c } = ctx;
  const qs = b.items.map(ctx.q);
  const prev = c.blocks[i - 1]?.slot;
  const parent = band.name === "parent";
  const list = (render: (q: DraftQuestion, k: number) => string, cls = "list") => `<div class="${cls}">${qs.map(render).join("")}</div>`;
  const line = (q: DraftQuestion, k: number) => (parent ? parentItem(q, band, b.figures?.[k]) : lineItem(q, band, b.hints?.[k], 60, b.figures?.[k]));
  const items = (cls = "list") => (parent ? list(line, "pcards") : list(line, cls));
  const chip = (fallback?: Chip, note?: string) => {
    const own = CHIPS[b.slot] ?? fallback;
    return own ? chipHtml(own, b.note ?? note ?? NOTES[b.slot]) : "";
  };
  const firstOfPage = i === 0 && (ctx.page.type === "remember-these" || ctx.page.type === "remember-these-mixed-set");

  switch (b.slot) {
    case "warm-up":
      return chip() + list((q) => factItem(q, band), "facts");
    case "fix-it":
      if (parent) return chip() + items();
      return chip() + `<div class="panel p-fx"><div class="inner">${qs.map((q, k) => cardItem(q, band, 60, "card", b.figures?.[k])).join("")}</div></div>`;
    case "in-your-head":
      return `<div class="panel p-hd"><div class="lab">${escape(b.label ?? "In your head")}</div><div class="list" style="margin-top:10px">${qs.map((q) => lineItem(q, band)).join("")}</div></div>`;
    case "remember-these":
      return (firstOfPage ? "" : chip()) + items(parent ? "pcards" : "two");
    case "try-first":
      return (prev === undefined ? chipHtml(NEW_IDEA, b.note) : "")
        + `<div class="outl"><div class="lab">Try this first</div>${qs.map((q, k) => lineItem(q, band, null, 60, b.figures?.[k])).join("")}</div>`;
    case "worked-example": {
      const head = prev === "try-first" ? "" : chipHtml(NEW_IDEA, b.note);
      const label = `<div class="lab">Worked example${b.label ? ` · ${escape(b.label)}` : ""}</div>`;
      const ways = b.methods && b.methods.length > 0
        ? `<div class="ways">${b.methods.map((m, k) => `<div class="in"><div class="lab">Method ${k + 1}${m.label ? ` · ${escape(m.label)}` : ""}</div><div class="wk">${m.lines.map(worked).join("<br>")}</div></div>`).join("")}</div>`
        : "";
      const why = b.figure || b.explain
        ? `<div class="fig2">${b.figure ? figureSvg(b.figure, band.name === "mid" ? 1 : 1.3) : ""}<div class="why"><div class="lab">What's going on</div><span>${escape(b.explain ?? "")}</span></div></div>`
        : "";
      return head + `<div class="panel p-ni" style="display:flex;flex-direction:column;gap:12px">${label}${ways}${ways && b.explain && !b.figure ? `<span>${escape(b.explain)}</span>` : why}</div>`;
    }
    case "now-you":
      return parent
        ? items()
        : `<div class="outl"><div class="lab">Now you${b.label ? `: ${escape(b.label)}` : ""}</div><div class="list">${qs.map((q, k) => lineItem(q, band, null, 60, b.figures?.[k])).join("")}</div></div>`;
    case "spot-the-error": {
      // Full width at every level: Sam's work, the yes/no strip and the fix box do not fit a half-width parent card.
      const who = b.who ?? "Sam";
      return chip() + `<div class="outl"><div class="q" style="align-items:flex-start"><span class="lab">${escape(who)}'s work</span><span class="wk">${(b.lines ?? []).map(worked).join("<br>")}</span></div>`
        + qs.map((q) => {
          const { inline, full } = regionsSplit(q, { band, labels: true });
          return `<div class="list" ${mark.question(q.number)}><div class="q"><span class="n">${q.number}</span><span class="qb">${text(q)}</span><span class="rgs">${inline}</span></div>${full}</div>`;
        }).join("") + `</div>`;
    }
    case "watch-one":
      return chipHtml(PRACTICE, b.note) + `<div class="panel p-pr" style="display:flex;flex-direction:column;gap:8px"><div class="lab">Watch one${b.label ? ` · ${escape(b.label)}` : ""}</div><div class="wk">${(b.lines ?? []).map(worked).join("<br>")}</div></div>`;
    case "finish-these":
      return `<div class="lab">Finish these</div>` + items(ctx.six ? "two" : "list");
    case "on-your-own": {
      const head = prev === "finish-these" ? `<div class="lab">On your own</div>` : chipHtml(PRACTICE, b.note);
      // Column sums on the 8-page day; the 6-page practice page lists them, as in the sample (DESIGN.md 7.2).
      const columns = !parent && !ctx.six && qs.length > 0 && !b.figures?.some(Boolean) && qs.every((q) => ["add", "subtract", "multiply"].includes(q.package.operation?.kind ?? "") && packageItem(q.package).regions.length === 1);
      return head + (columns ? list((q) => columnItem(q, band), "cols") : items(ctx.six ? "two" : "list"));
    }
    case "practice-row": {
      const head = prev === "practice-row" ? "" : chipHtml(PRACTICE, b.note);
      const columns = !parent && !b.figures?.some(Boolean) && qs.every((q) => ["add", "subtract", "multiply"].includes(q.package.operation?.kind ?? "") && packageItem(q.package).regions.length === 1);
      return head + (b.label ? `<div class="lab">${escape(b.label)}</div>` : "") + (columns ? list((q) => columnItem(q, band), "cols") : items("two"));
    }
    case "unit-b-practice":
      return chipHtml(PRACTICE, b.note) + items(qs.length >= 2 && !parent ? "two" : "list");
    case "solve-it-two-ways":
      return qs.map((q) => {
        const names = regionNames(q);
        const works = names.filter((x) => x.region.kind === "work").map((x) => regionHtml(q, x.region, x.name, { band, work: 110 })).join("");
        const boxes = names.filter((x) => x.region.kind === "box").map((x) => regionHtml(q, x.region, x.name, { band, labels: true })).join("");
        return `<div class="tw" ${mark.question(q.number)}><div class="q"><span class="n">${q.number}</span><span class="lab" style="color:#0C0C0E">Solve it two ways</span><span class="qb">${qtext(q)}</span></div><div class="ways2">${works}${boxes}</div></div>`;
      }).join("");
    case "word-problems":
      return qs.map((q, k) => {
        const names = regionNames(q);
        const work = names.filter((x) => x.region.kind === "work").map((x) => regionHtml(q, x.region, x.name, { band, work: 88 })).join("");
        const boxes = names.filter((x) => x.region.kind === "box" || x.region.kind === "choice").map((x) => regionHtml(q, x.region, x.name, { band, labels: true })).join("");
        const fig = b.figures?.[k];
        return `<div class="story" ${mark.question(q.number)}><div class="head"><span class="sn">${q.number}</span><span class="qb">${text(q)}</span>${fig ? figureSvg(fig) : ""}</div><div class="act">${work}${boxes}</div></div>`;
      }).join("");
    case "how-do-you-know":
      return qs.map((q) => {
        const [lines] = regionNames(q);
        return `<div ${mark.question(q.number)}><div class="ln" ${measureAttr(lines.name)}><div class="lp"><span class="n">${q.number}</span> ${text(q)}</div>${"<i></i>".repeat(LINES)}</div></div>`;
      }).join("");
    case "reminder": {
      const fig = b.figure ? figureSvg(b.figure) : "";
      return chip(undefined, b.note) + `<div class="panel p-ni"><div class="fig2"><div style="display:flex;flex-direction:column;gap:8px"><div class="lab">${escape(b.label ?? "Remember")}</div>${fig}<div class="wk">${(b.lines ?? []).map(worked).join("<br>")}</div></div><div class="why"><div class="lab">What's going on</div><span>${escape(b.explain ?? "")}</span></div></div></div>`;
    }
    case "mixed-set":
      return chip() + `<div class="mxs">` + qs.map((q) => {
        const names = regionNames(q);
        const pick = (kind: AnswerRegion["kind"]) => names.find((x) => x.region.kind === kind);
        const tick = pick("choice");
        const box = pick("box");
        const work = pick("work");
        const choices = tick && tick.region.kind === "choice" ? tick.region.choices.map((c) => `<span class="ch"><i class="tb"></i><span>${escape(c)}</span></span>`).join("") : "";
        return `<div class="mx" ${mark.question(q.number)}><div class="q"><span class="n">${q.number}</span><span class="qb">${text(q)}</span></div>`
          + (tick ? `<div class="stp"><span class="sb">1</span><span class="sl">Tick the operation:</span><span class="strip" ${measureAttr(tick.name)}>${choices}</span><span class="t1"><span>Tick one</span><i>✓</i></span></div>` : "")
          + (box ? `<div class="stp"><span class="sb">2</span><span class="sl">Write the answer:</span>${regionHtml(q, box.region, box.name, { band })}${work ? regionHtml(q, work.region, work.name, { band, work: 44 }) : ""}</div>` : "")
          + `</div>`;
      }).join("");
    case "picture-stories":
      return chip() + list((q, k) => parentItem(q, band, b.figures?.[k]), "pcards");
    case "friday-5": case "unit-check": case "mini-test": case "already-know-it":
      return chip() + items(parent ? "pcards" : qs.length > 5 ? "two" : "list");
    case "show-what-you-know": case "level-test": {
      // The test and the celebration fill their page: each item is a card in a grid whose rows share the room left
      // under the chip, and its work area grows into its card (an item with no work region gets a plain one).
      if (parent) return chip() + list((q, k) => parentItem(q, band, b.figures?.[k]), `pcards fill`);
      const cols = qs.length <= 3 ? 1 : 2;
      return chip() + `<div class="fill" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${qs.map((q) => {
        const { inline, full } = regionsSplit(q, { band, work: "fill", labels: true });
        const work = full || `<div class="wb"><span class="lab">Show your work</span></div>`;
        return `<div class="tc" ${mark.question(q.number)}><div class="q"><span class="badge">${q.number}</span><span class="qb">${qtext(q)}</span><span class="rgs">${inline}</span></div>${work}</div>`;
      }).join("")}</div>`;
    }
    case "challenge": {
      const side = ctx.six && qs.length === 2;
      const work = "fill" as const;
      return chip() + `<div class="chs${side ? " side2" : ""}">${qs.map((q) => {
        const { inline, full } = regionsSplit(q, { band, work });
        return `<div class="chc" ${mark.question(q.number)}><div class="top"><span class="badge">${q.number}</span><span class="qb">${text(q)}</span>${inline}</div>${full}</div>`;
      }).join("")}</div>`;
    }
    case "math-in-the-world": {
      const info = (b.info ?? []).map((x) => `<div class="ic"><span class="lab">${escape(x.label)}</span><span class="v">${escape(x.value)}</span></div>`).join("");
      return chip() + (info ? `<div class="info">${info}</div>` : "") + qs.map((q) => {
        const names = regionNames(q);
        const boxes = names.filter((x) => x.region.kind === "box");
        if (boxes.length > 1) {
          return `<div class="list" ${mark.question(q.number)}><div class="q"><span class="n">${q.number}</span><span class="qb">${text(q)}</span></div><div class="parts">${boxes.map((x) => regionHtml(q, x.region, x.name, { band, labels: true }).replace(`<span class="rl box">`, `<span class="rl">`)).join("")}</div></div>`;
        }
        const { inline, full } = regionsSplit(q, { band, work: 120, labels: true });
        return `<div class="list" ${mark.question(q.number)}><div class="q"><span class="n">${q.number}</span><span class="qb">${text(q)}</span><span class="rgs">${inline}</span></div>${full}</div>`;
      }).join("");
    }
  }
}

/** Slots that take the free room of their page: their cards and work areas grow into it. */
const GROW = new Set<SlotName>(["challenge", "show-what-you-know", "level-test"]);

// ---------- Pages ----------

const scanMarks = `<i class="scan tl"></i><i class="scan tr"></i><i class="scan bl"></i><i class="scan br"></i>`;
const wordmark = `<span class="wm"><span>Unica Learning</span><i></i></span>`;

function footer(page: DraftPage, parts: PageParts, id: string): string {
  return `<footer class="ft">${parts.qr}<div class="ids"><span>${escape(id)}</span><span class="pn">Page <span ${mark.pageNumber}>${page.number}</span></span></div>${wordmark}</footer>`;
}

function dayPage(page: DraftPage, parts: PageParts, c: DayContent): string {
  const band = bandOf(c.level);
  const byNumber = new Map(page.questions.map((q) => [q.number, q]));
  const ctx: Ctx = {
    page, c, band, six: c.pages <= 6 && band.name === "mid",
    q: (n) => {
      const q = byNumber.get(n);
      if (!q) throw new Error(`page ${page.number}: a slot names question ${n}, which the page does not have`);
      return q;
    },
  };
  const label = `Day ${c.day} · Page ${c.page} of ${c.pages} · ${c.topic}`;
  const header = `<header class="hd"><div class="nd"><span>Name</span><i class="r1"></i><span>Date</span><i class="r2"></i></div>`
    + `<div class="dl" ${mark.slot("day-label")}>${escape(label)}</div><h1 class="tt" ${mark.slot("title")}>${escape(c.title)}</h1>`
    + `<p class="st" ${mark.slot("subtitle")}>${escape(c.subtitle)}</p>`
    + (c.grownUp ? `<p class="gu" ${mark.slot("grown-up")}><b>For the grown-up:</b> ${escape(c.grownUp)}</p>` : "") + `</header>`;
  // A Challenge block takes the free room of its page: its work boxes grow into it (DESIGN.md section 4).
  const blocks = c.blocks.map((b, i) => `<section class="blk${GROW.has(b.slot) ? " grow" : ""}" data-measure="block-${i}">${blockHtml(b, i, ctx)}${missingHtml(b)}</section>`).join("");
  return `<div class="pg ${band.name} f-${familyOf(page, c)}">${scanMarks}<div class="frame">${header}<main class="ct" ${mark.slot("content")}>${blocks}</main></div>${footer(page, parts, c.id)}</div>`;
}

/** A failed question with nothing to print: a red placeholder with its number and why (review drafts only). */
const missingHtml = (b: Block) => (b.missing ?? []).map((m) =>
  `<div class="qfail" data-failed-question="${m.number}" style="border:2px dashed #B42318;background:#FDECEA;color:#B42318;border-radius:8px;padding:8px 12px;font:600 13px/1.4 Helvetica,Arial,sans-serif;margin-top:8px">Question ${m.number} failed: ${escape(m.reason)}</div>`).join("");

const UNICA_MARK = `<div class="mk"><i class="y"></i><i></i><i class="b"></i><i></i><i class="o"></i><i></i><i class="g"></i><i></i><i></i></div>`;

function coverPage(page: DraftPage, parts: PageParts, c: Extract<PageContent, { kind: "cover" }>): string {
  const label = c.madeFrom === "assessment" ? `Made from ${c.child}'s assessment` : `Made from ${c.child}'s last workbook`;
  return `<div class="pg mid">${scanMarks}<div class="cv" ${mark.slot("page")}><div class="top">${wordmark}<span class="wn">Workbook ${c.workbook} · 10 days</span></div>${UNICA_MARK}`
    + `<div class="for" ${mark.slot("made-for")}>Made for ${escape(c.child)} · Level U${c.level} · ${escape(c.levelTitle)}</div>`
    + `<h1 ${mark.slot("cover-title")}>${escape(c.title[0])}<br><span class="hl">${escape(c.title[1])}</span></h1>`
    + `<div class="made" ${mark.slot("made-from")}><span class="lab">${escape(label)}</span><p>${escape(c.sentence)}</p><ul>${c.bullets.map((x) => `<li><i></i><span>${escape(x)}</span></li>`).join("")}</ul></div>`
    + `<p class="pl" ${mark.slot("parent-line")}>${escape(c.parentLine)}</p>`
    + `<p class="nx" ${mark.slot("next")}>How this works and your plan are next. 10 days, ${c.pagesADay} pages a day, about ${c.minutes.min} to ${c.minutes.max} minutes a day.</p>`
    + `</div>${footer(page, parts, c.id)}</div>`;
}

function howPlanPage(page: DraftPage, parts: PageParts, c: Extract<PageContent, { kind: "how-plan" }>): string {
  const rows = c.rows.map((r) => `<tr><td class="d">Day ${r.day}</td><td><span class="tp" ${mark.slot(`day-${r.day}`)}><b>${escape(r.topic)}</b><span class="t2">${escape(r.second)}</span></span></td>`
    + `<td class="pp">${r.pages[0]}–${r.pages[1]}</td><td class="dn"><i class="tb"></i></td></tr>`).join("");
  const how = [
    { chip: { label: "Every day", cls: "c-pr", icon: ICONS.target }, text: `${c.pagesADay} pages a day, ${c.minutes.min} to ${c.minutes.max} minutes.` },
    { chip: { label: "Scan", cls: "c-mx", icon: ICONS.search }, text: "Scan each finished page in the Unica app." },
    { chip: { label: "Stuck?", cls: "c-ni", icon: ICONS.book }, text: "Call the Teaching Assistant." },
    { chip: { label: "Fix it", cls: "c-fx", icon: ICONS.wrench }, text: "Anything your child got wrong last time comes back as new questions." },
  ];
  return `<div class="pg mid">${scanMarks}<div class="hp" ${mark.slot("page")}><div class="top"><span>HOW IT WORKS · ${escape(c.child.toUpperCase())}'S PLAN</span><span>WORKBOOK ${c.workbook}</span></div>`
    + `<table><thead><tr><th style="width:96px">DAY</th><th>TOPIC</th><th style="width:96px">PAGES</th><th style="width:56px;text-align:right">DONE</th></tr></thead><tbody>${rows}</tbody></table>`
    + `<div class="how"><span class="lab">How it works</span><div class="hw">${how.map((h) => `<div>${chipHtml(h.chip)}<p>${escape(h.text)}</p></div>`).join("")}</div></div>`
    + `</div>${footer(page, parts, c.id)}</div>`;
}

function backCoverPage(page: DraftPage, parts: PageParts, c: Extract<PageContent, { kind: "back-cover" }>): string {
  const map = Array.from({ length: 30 }, (_, i) => `<div class="lv${i + 1 === c.level ? " now" : ""}"><i></i><span class="ll">U${i + 1}</span></div>`).join("");
  return `<div class="pg mid">${scanMarks}<div class="bk" ${mark.slot("page")}>${UNICA_MARK}<h2>My levels</h2><p>Colour the square of each level you reach. You are on Level U${c.level} now.</p>`
    + `<div class="map">${map}</div><div class="key"><span><i></i>Not yet</span><span><i style="background:#FFD23F"></i>Coloured in: I reached it</span></div></div>${footer(page, parts, c.id)}</div>`;
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

/** The template's fit check of a laid-out day page (see the header). */
export function fitProblems(page: DraftPage, measured: ReadonlyMap<string, MeasuredElement>): FitProblem[] {
  const c = page.content;
  if (!c || c.kind !== "day") return [];
  const band = bandOf(c.level);
  const at = where(page, c);
  const problems: FitProblem[] = [];
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

  // Writing space: answer boxes by the band, work boxes, writing lines; and no box or choice over its own text.
  const slotOf = (n: number) => c.blocks.find((b) => b.items.includes(n))?.slot ?? null;
  for (const q of page.questions) {
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
        if (m.height < band.box - 0.5) small("answer box height", m.height, band.box);
        if (m.width < ANSWER_MIN - 0.5) small("answer box width", m.width, ANSWER_MIN);
      } else if (region.kind === "work" && m.height < WORK_MIN - 0.5) small("work box height", m.height, WORK_MIN);
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
    page(page, parts) {
      const c = page.content;
      if (!c) return null;
      switch (c.kind) {
        case "day": return dayPage(page, parts, c);
        case "cover": return coverPage(page, parts, c);
        case "how-plan": return howPlanPage(page, parts, c);
        case "back-cover": return backCoverPage(page, parts, c);
        case "blank": return blankPage(page, parts, c);
      }
    },
    fit: (page, measured) => fitProblems(page, measured),
    answerMin: ANSWER_MIN,
  };
}

