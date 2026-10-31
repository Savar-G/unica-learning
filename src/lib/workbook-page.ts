// Workbook pages and their slots (#310, spec #296): what each page of a book holds, as data the template lays out.
// The planner (#308, src/lib/workbook-plan.ts) decides each day's pages and the parts on them; pageSlots names the
// slots each planned part fills on its page (DESIGN.md section 7), with the number of items each takes. A filler (the
// sample content in src/lib/workbook-sample-book.ts today, the AI generator in #311 later) writes each slot's content:
// its question packages and the words, worked lines and figures around them. assembleBook puts the book in order
// (cover, How + Plan, the ten days, back cover, then blank pages to a multiple of 4, D-191), numbers the pages from
// the cover and the questions from 1 on each page, gives each question its place (its package's ref) and each page its
// printed ID (UL·<CHILD>·W<nn>·D<nn>·P<n>, D-187).
//
// The content never chooses a position, size, colour or font: the template (src/lib/workbook-template.ts) owns those.
// Pure TypeScript: no Next.js, React, network, database or clock.
import type { QuestionPackage } from "@/lib/question-package";
import type { PartKind, PlannedPage, PlannedPart, WorkbookPlan } from "@/lib/workbook-plan";
import type { DraftPage, WorkbookDraft } from "@/lib/workbook-render";
import { slotMax } from "@/lib/workbook-template";

// ---------- Slots ----------

/** The named slots of a day page (DESIGN.md sections 4 and 7). */
export const SLOTS = [
  "warm-up", "fix-it", "in-your-head", "remember-these", "try-first", "worked-example", "now-you", "spot-the-error",
  "watch-one", "finish-these", "on-your-own", "practice-row", "solve-it-two-ways", "word-problems", "how-do-you-know",
  "reminder", "unit-b-practice", "mixed-set", "picture-stories", "friday-5", "challenge", "math-in-the-world",
  "show-what-you-know", "level-test", "unit-check", "mini-test", "already-know-it",
] as const;
export type SlotName = (typeof SLOTS)[number];

/** A picture drawn by code from data, never an image (DESIGN.md section 4, visual models). */
export type Figure =
  | { kind: "dots"; groups: number[] }
  | { kind: "ten-frame"; filled: number }
  | { kind: "number-line"; from: number; to: number; step: number; hops: [number, number][] }
  | { kind: "blocks"; tens: number; ones: number }
  | { kind: "array"; rows: number; columns: number };

/**
 * A worked line: plain text, with the given or worked numbers the child reads in blue between [ and ]
 * ("1 × [36] = 36").
 */
export type WorkedLine = string;

/** One slot's content on a page. Which fields a slot reads is in the template; the rest are left out. */
export interface Block {
  slot: SlotName;
  /** The questions in the slot, by their number on the page, in reading order. */
  items: number[];
  /** A panel or row label: "FACTOR PAIRS OF 24", "TWO DIGITS". */
  label?: string;
  /** A line beside the slot's chip: "Do as many as you can.", "Tick + or −, then write the answer.". */
  note?: string;
  /** Worked lines: Watch one, a reminder, the wrong work of Spot the error. */
  lines?: WorkedLine[];
  /** A worked example solved two ways (Method 1, Method 2). */
  methods?: { label: string; lines: WorkedLine[] }[];
  /** The worked example's or reminder's figure, beside "What's going on". */
  figure?: Figure;
  /** "What's going on": one to three sentences. */
  explain?: string;
  /** Per item: the given start of a Finish these item, in blue, or null. */
  hints?: (WorkedLine | null)[];
  /** Per item: its picture (a word problem's dots, a picture story), or null. */
  figures?: (Figure | null)[];
  /** Math in the world's info cards ("EDGING", "$4 per metre"). */
  info?: { label: string; value: string }[];
  /** Spot the error: whose work it is ("Sam"). */
  who?: string;
}

/** A day page's content: its header and its slots. */
export interface DayContent {
  kind: "day";
  /** The printed page ID (D-187). */
  id: string;
  level: number;
  day: number;
  /** Its place in the day, from 1, and the day's page count. */
  page: number;
  pages: number;
  /** The topic in the day label: "FACTORS AND FACTOR PAIRS". */
  topic: string;
  title: string;
  subtitle: string;
  /** "For the grown-up: ..." under the title (parent-led and early New idea pages), or null. */
  grownUp: string | null;
  blocks: Block[];
}

export interface CoverContent {
  kind: "cover";
  id: string;
  level: number;
  child: string;
  workbook: number;
  levelTitle: string;
  /** The cover title in two lines; the second sits on the yellow highlight. */
  title: [string, string];
  /** "assessment" for workbook 1, "last-workbook" after. */
  madeFrom: "assessment" | "last-workbook";
  /** What the assessment (or the last workbook) showed: one sentence. */
  sentence: string;
  /** What this workbook does: four bullets. */
  bullets: string[];
  /** One sentence for the parent: what to ask the child to show them this fortnight. */
  parentLine: string;
  pagesADay: number;
  minutes: { min: number; max: number };
}

export interface PlanRow {
  day: number;
  /** Unit A's topic, and Unit B's (or what the day does instead) under it. */
  topic: string;
  second: string;
  /** The book pages of the day. */
  pages: [number, number];
}

export interface HowPlanContent {
  kind: "how-plan";
  id: string;
  level: number;
  child: string;
  workbook: number;
  pagesADay: number;
  minutes: { min: number; max: number };
  rows: PlanRow[];
}

export interface BackCoverContent {
  kind: "back-cover";
  id: string;
  level: number;
}

export interface BlankContent {
  kind: "blank";
  id: string;
  level: number;
}

export type PageContent = DayContent | CoverContent | HowPlanContent | BackCoverContent | BlankContent;

/** A slot to fill on a planned page: its name, the planned part it comes from (its index on the page) and its items. */
export interface PlannedSlot {
  slot: SlotName;
  part: number;
  items: number;
}

/**
 * The slots one planned part fills, by its kind and where it sits. A page holds what DESIGN.md section 7 gives it, so
 * where the plan asks for more than that page holds, the slot takes the page's share:
 * - page 2 (New idea): the Now you card takes 2 items beside a Spot the error card, else up to 4 ("Spot the error card
 *   or Now you card (2 to 4 items)");
 * - the Unit B page: a new B step shows its worked example as the reminder panel, then practice (no Now you card),
 *   up to 8 items, 2 fewer beside the worked example, 2 fewer beside a Spot the error card and 2 fewer on a 6-page day;
 * - Practice 2: up to 12 column problems, 8 beside Solve it two ways or Spot the error, 4 fewer again beside a spare
 *   Remember these? block;
 * - word problems: 3 stories, 2 beside a spare Remember these? block;
 * - the warm-up: up to 30 facts, 27 beside the In your head box;
 * - the 6-page Practice page (Watch one, Finish these, On your own, Solve it two ways, Spot the error): 2 On your own
 *   items, and no room for a spare Remember these? block;
 * - a New idea page with Try this first and Spot the error has no Now you card;
 * - the Mixed set: 2 items beside the Challenge cards on the 6-page review page.
 * U4 to U9 have bigger type and fewer items (DESIGN.md 7.3): page 2 has no Now you card beside Spot the error, Practice
 * 2 has one row, On your own takes 3, Unit B practice 2 fewer, stories 2, and a spare Remember these? block 2 items.
 */
function partSlots(part: PlannedPart, page: PlannedPage, level: number): { slots: { slot: SlotName; items: number }[]; why: string } {
  const k: PartKind = part.kind;
  const early = level <= 9;
  const has = (kind: PartKind) => page.parts.some((p) => p.kind === kind);
  const reviewPage = page.parts[0]?.kind === "remember-these" || page.parts[0]?.kind === "warm-up";
  const unitBPage = page.parts.some((p) => p.kind === "practice" && p.unit === "B");
  const laid = (slots: { slot: SlotName; items: number }[], why = "") => ({ slots, why });
  switch (k) {
    case "new-idea":
      if (part.unit === "B" && unitBPage) return laid([{ slot: "worked-example", items: 0 }], "a new Unit B step shows only its worked example on the Unit B page");
      if (has("try-first") && has("spot-the-error")) return laid([{ slot: "worked-example", items: 0 }], "no room for a Now you card beside Try this first and Spot the error");
      if (early && has("spot-the-error")) return laid([{ slot: "worked-example", items: 0 }], "no room for a Now you card beside Spot the error at U1 to U9");
      return laid(
        [{ slot: "worked-example", items: 0 }, { slot: "now-you", items: Math.min(part.items, has("spot-the-error") || early ? 2 : 4) }],
        has("spot-the-error") ? "the Now you card takes 2 items beside Spot the error" : early ? "the Now you card takes 2 items at U1 to U9" : "the Now you card takes at most 4 items",
      );
    case "practice": {
      if (page.type === "practice-2") {
        // Rows getting harder, four to a row.
        const room = early ? 4 : 12 - (has("solve-it-two-ways") || has("spot-the-error") ? 4 : 0) - (has("remember-these") ? 4 : 0);
        const items = Math.min(part.items, room);
        const rows = Math.ceil(items / 4);
        return laid(Array.from({ length: rows }, (_, i) => ({ slot: "practice-row" as const, items: Math.min(4, items - i * 4) })), `Practice 2 has room for ${room} items beside its other blocks`);
      }
      if (part.unit === "B") {
        // Unit B: a reminder panel first when no New idea of B teaches on the page, then practice.
        const reminder = page.parts.some((p) => p.kind === "new-idea" && p.unit === "B") ? [] : [{ slot: "reminder" as const, items: 0 }];
        // Up to 8 items; 2 fewer beside a new step's worked example, 2 fewer beside a Spot the error card.
        const room = 8 - (reminder.length === 0 ? 2 : 0) - (has("spot-the-error") ? 2 : 0) - (early || level >= 19 ? 2 : 0);
        return laid([...reminder, { slot: "unit-b-practice", items: Math.min(part.items, room) }], `the Unit B page has room for ${room} practice items`);
      }
      // Faded: one worked (Watch one), two partly done, the rest alone.
      const watch = part.faded?.watch ?? 0;
      const finish = part.faded?.finish ?? 0;
      // On your own: the rest, or 2 beside Solve it two ways and Spot the error (the 6-page practice page).
      const own = Math.max(0, part.items - watch - finish);
      const full = has("solve-it-two-ways") && has("spot-the-error");
      return laid([
        ...(watch > 0 ? [{ slot: "watch-one" as const, items: 0 }] : []),
        ...(finish > 0 ? [{ slot: "finish-these" as const, items: finish }] : []),
        { slot: "on-your-own", items: full ? Math.min(own, 2) : early ? Math.min(own, 3) : own },
      ], full ? "On your own takes 2 items beside Solve it two ways and Spot the error" : "On your own takes 3 items at U1 to U9");
    }
    // The stories, then one "How do you know?" with two writing lines.
    case "word-problems":
      return laid([{ slot: "word-problems", items: Math.min(part.items, has("remember-these") || early ? 2 : 3) }, { slot: "how-do-you-know", items: 1 }], "the stories page holds 2 stories beside a Remember these? block or at U1 to U9");
    case "picture-stories":
      return laid([{ slot: "picture-stories", items: Math.min(part.items, has("remember-these") && early ? 2 : part.items) }], "2 picture stories fit beside Remember these? at U1 to U9");
    // The plan (writing lines), the lettered parts, and the final answer with its work box.
    case "math-in-the-world": return laid([{ slot: "math-in-the-world", items: 3 }]);
    // A spare Remember these? block on a page that is already full (the 6-page Practice page) gets no room.
    case "remember-these":
      if (page.parts.some((p) => p.kind === "practice" && p.faded) && has("solve-it-two-ways") && has("spot-the-error")) return laid([], "the 6-page Practice page has no room for a spare Remember these? block");
      return laid([{ slot: "remember-these", items: early && !reviewPage ? Math.min(part.items, 2) : part.items }], "a spare Remember these? block takes 2 items at U1 to U9");
    // The 6-page review page: 2 Mixed set items beside the Challenge cards (DESIGN.md 7.2).
    case "mixed-set": return laid([{ slot: "mixed-set", items: Math.min(part.items, has("challenge") ? 2 : 4) }], "the Mixed set takes 2 items beside the Challenge cards");
    // Up to 30 facts; 27 (9 rows) beside the In your head box.
    case "warm-up": return laid([{ slot: "warm-up", items: Math.min(part.items, has("in-your-head") ? 27 : 30) }], "the warm-up takes 27 facts beside In your head");
    case "try-first": case "spot-the-error": case "solve-it-two-ways": case "in-your-head":
      return laid([{ slot: k, items: 1 }]);
    default: return laid([{ slot: k, items: part.items }]);
  }
}

/** Slots that are panels with no items of their own, and the room of cards each takes on a parent-led page. */
const PANELS: Partial<Record<SlotName, number>> = { "worked-example": 4, "watch-one": 2, reminder: 3 };
/** A parent-led page (U1 to U3) holds 6 item cards (2 columns, 3 rows); each slot after the first takes 1 more for its chip. */
const PARENT_CARDS = 6;
/** The room the 6-card budget leaves spare on a parent-led page (laid out: about 120 to 180 px), which a wrapped header uses first. */
const PARENT_SPARE = 100;

/** Slots a wrapped header may take a row from: lists and grids of several items, never Fix it or a single card. */
const TRIMMABLE = new Set<SlotName>([
  "remember-these", "warm-up", "on-your-own", "practice-row", "unit-b-practice", "now-you", "word-problems", "mixed-set",
  "picture-stories", "friday-5", "unit-check", "mini-test", "already-know-it", "show-what-you-know", "level-test",
]);

/** The items in one row of a slot as the template lays it out (the most, so a row's removal frees a row). */
function rowOf(x: PlannedSlot, level: number): number {
  if (level <= 3) return 2;
  const mid = level >= 10;
  switch (x.slot) {
    case "warm-up": return mid ? 3 : 2;
    case "practice-row": return 4;
    case "on-your-own": return mid ? 4 : 2;
    case "remember-these": case "unit-b-practice": case "picture-stories": return 2;
    case "friday-5": case "unit-check": case "mini-test": case "already-know-it": case "show-what-you-know": case "level-test":
      return x.items > 5 ? 2 : 1;
    default: return 1;
  }
}

/** A day page's header: its topic (in the day label), title, subtitle and the grown-up line. */
export interface DayHeader {
  topic: string;
  title: string;
  subtitle: string;
  grownUp: string | null;
}

/** The height one row of a slot takes, with its gap, in CSS pixels: the least, so removing rows frees at least this. */
function rowHeight(x: PlannedSlot, level: number): number {
  if (level <= 3) return 130;
  const big = level <= 9;
  switch (x.slot) {
    case "practice-row": case "on-your-own": return big ? 60 : 100;
    case "mixed-set": return 110;
    case "word-problems": case "picture-stories": return big ? 130 : 150;
    case "warm-up": return big ? 60 : 50;
    default: return big ? 54 : 46;
  }
}

/**
 * How much taller a day page's header is than with one line each for its day label, title and subtitle, in CSS
 * pixels: a word wrap at the characters a line of each holds in its band (Geist and Geist Mono at DESIGN.md's sizes,
 * for usual text), times the line height. A line of unusually wide letters can hold fewer, so the estimate can be
 * short; the fit check still measures the real page, and a page it fails is redone (#311).
 */
export function headerGrowth(h: DayHeader, level: number, day: number, page: number, pages: number): number {
  const big = level <= 9;
  const lines = (text: string, perLine: number) => {
    let n = 1;
    let used = 0;
    for (const word of text.split(/\s+/)) {
      if (used > 0 && used + 1 + word.length > perLine) {
        n++;
        used = word.length;
      } else used += (used > 0 ? 1 : 0) + word.length;
    }
    return n;
  };
  const label = lines(`Day ${day} · Page ${page} of ${pages} · ${h.topic}`, big ? 60 : 82) - 1;
  const title = lines(h.title, big ? 42 : 54) - 1;
  const subtitle = lines(h.subtitle, big ? 68 : 90) - 1;
  return label * (big ? 22 : 16) + title * (big ? 45 : 38) + subtitle * (big ? 28 : 21);
}

/** Planned items a page leaves out: the part, how many it asked for, how many the page placed, and why. */
export interface Omission {
  /** The part's index on the planned page, and its kind. */
  part: number;
  kind: PartKind;
  requested: number;
  placed: number;
  reason: string;
}

/** A planned page laid into slots, with what it leaves out. */
export interface PageLayout {
  slots: PlannedSlot[];
  omissions: Omission[];
}

/** The items a part asks for: a faded practice part's Watch one is worked, not an item. */
const asked = (part: PlannedPart) => part.items - (part.kind === "practice" ? part.faded?.watch ?? 0 : 0);

/**
 * A planned page laid into its slots, with the items each takes: the contract between the planner and a filler. A slot
 * left with no items is left out (a panel stays). Each slot takes at most what the template's slot takes (slotMax).
 * On a parent-led page (U1 to U3) the slots share the page's 6 cards; Fix it gets its cards first, then the other slots
 * in order, so review items are dropped before a Fix it item (the skeleton's 6 to 10 a page does not fit 10 at these
 * sizes). Every part that places fewer items than it asked for is in `omissions`, with the reason, never dropped
 * silently: the generator (#311) and the admin review (#312) show them.
 */
export function pageSlots(page: PlannedPage, level: number, o: { headerGrowth?: number } = {}): PageLayout {
  const pages = level >= 19 ? 6 : 8;
  const why = new Map<number, string>();
  let slots: PlannedSlot[] = page.parts.flatMap((part, i) => {
    const laid = partSlots(part, page, level);
    if (laid.why) why.set(i, laid.why);
    return laid.slots.map((x) => {
      const max = x.slot in PANELS ? 0 : slotMax(x.slot, { level, pages });
      if (x.items > max && !(x.slot in PANELS)) why.set(i, `the ${x.slot} slot takes at most ${max} items`);
      return { ...x, items: Math.min(x.items, max), part: i };
    });
  }).filter((x) => x.items > 0 || x.slot in PANELS);

  if (level <= 3) {
    // Fix it first, then the rest in order; a slot after the page's first takes one card more for its chip.
    let room = PARENT_CARDS;
    const placed = new Map<PlannedSlot, number>();
    const order = [...slots.filter((x) => x.slot === "fix-it"), ...slots.filter((x) => x.slot !== "fix-it")];
    for (const x of order) {
      const chip = slots.indexOf(x) > 0 ? 1 : 0;
      const cost = PANELS[x.slot];
      if (cost !== undefined) {
        if (room >= cost + 1) {
          room -= cost;
          placed.set(x, 0);
        }
        continue;
      }
      const items = Math.max(0, Math.min(x.items, room - chip));
      if (items > 0) {
        room -= items + chip;
        placed.set(x, items);
      }
      if (items < x.items) why.set(x.part, `a parent-led page holds ${PARENT_CARDS} cards`);
    }
    slots = slots.filter((x) => placed.has(x)).map((x) => ({ ...x, items: placed.get(x)! }));
  }

  // A header that wraps takes room from the content area: rows go until they free that room (DESIGN.md row heights).
  // Review rows go first, then the page's last list; a list keeps its last row while another list has rows to give.
  // Never Fix it or a one-item slot.
  slots = slots.map((x) => ({ ...x }));
  const grow = Math.max(0, (o.headerGrowth ?? 0) - (level <= 3 ? PARENT_SPARE : 0));
  const wrapped = `the page's header wraps, taking ${Math.ceil(grow)} px`;
  for (let freed = 0; freed < grow;) {
    const lists = slots.filter((x) => TRIMMABLE.has(x.slot) && x.items > 0);
    const candidates = lists.filter((x) => x.items > rowOf(x, level));
    const pool = candidates.length > 0 ? candidates : lists;
    const x = pool.find((c) => c.slot === "remember-these") ?? pool.at(-1);
    if (!x) break;
    x.items = Math.max(0, x.items - rowOf(x, level));
    freed += rowHeight(x, level);
    why.set(x.part, why.has(x.part) ? `${why.get(x.part)}; ${wrapped}` : wrapped);
  }
  slots = slots.filter((x) => x.items > 0 || x.slot in PANELS);

  const omissions = page.parts.flatMap((part, i): Omission[] => {
    const placed = slots.filter((x) => x.part === i).reduce((n, x) => n + x.items, 0);
    // Stories add a How do you know? item of their own.
    const extra = slots.filter((x) => x.part === i && x.slot === "how-do-you-know").reduce((n, x) => n + x.items, 0);
    const placedOwn = placed - extra;
    return placedOwn < asked(part)
      ? [{ part: i, kind: part.kind, requested: asked(part), placed: placedOwn, reason: why.get(i) ?? "the page has no room for it" }]
      : [];
  });
  return { slots, omissions };
}

// ---------- The book ----------

/** A filled slot: its content with its questions as packages (the book gives each its place and number). */
export interface FilledBlock extends Omit<Block, "items"> {
  items: QuestionPackage[];
}

/** A filled day page: its slots' content. */
export interface FilledDayPage {
  blocks: FilledBlock[];
}

export interface BookInput {
  workbookId: string;
  childId: string;
  /** The child's first name, as printed. */
  child: string;
  /** The workbook's place in the child's sequence, from 1. */
  number: number;
  levelTitle: string;
  profileBuild: string | null;
  plan: WorkbookPlan;
  cover: Pick<CoverContent, "title" | "sentence" | "bullets" | "parentLine">;
  /** Each planned day page's header, known before its slots: a header that wraps leaves less room for them. */
  header(day: number, page: PlannedPage): DayHeader;
  /** Each planned day page's content, for the slots pageSlots laid it into. */
  fill(day: number, page: PlannedPage, slots: PlannedSlot[]): FilledDayPage;
  /** Each day's row on the plan page: Unit A's topic and the line under it. */
  planRow(day: number): { topic: string; second: string };
  /**
   * The QR token of book page `n` (from 1). It must be unique across all workbooks: the desk finds a page by its token
   * alone (`/tutor/p/<token>`, WorkbookStore.pageByToken). In production give each page 16 random bytes in base64url,
   * as scripts/load-workbook-sample.ts does.
   */
  qrToken(n: number): string;
}

/** Planned items the book leaves out, with their book page, day and page of the day. */
export interface BookOmission extends Omission {
  page: number;
  day: number;
  dayPage: number;
}

/** An assembled book: the draft to render, and every planned item it left out (see pageSlots). */
export interface AssembledBook {
  draft: WorkbookDraft;
  omissions: BookOmission[];
}

/** The most pages a book may have (D-191: saddle stitch, at most 84). */
export const BOOK_PAGES_MAX = 84;

const two = (n: number) => String(n).padStart(2, "0");
/** The printed page ID: `UL·LEAH·W03·D04·P1`, `UL·LEAH·W03·COVER`, `UL·LEAH·W03·BLANK·P83`. */
export const pageId = (child: string, workbook: number, rest: string) => `UL·${child.toUpperCase()}·W${two(workbook)}·${rest}`;

/**
 * The whole book as a draft to render: cover, How + Plan, the planned days, back cover, then blank pages to a multiple
 * of 4, with every planned item the pages leave out. Throws when the book would pass 84 pages.
 */
export function assembleBook(o: BookInput): AssembledBook {
  const { plan } = o;
  const level = plan.level;
  const pages: DraftPage[] = [];
  const add = (type: string, dayLabel: string | null, content: PageContent, questions: DraftPage["questions"] = []) =>
    pages.push({ number: pages.length + 1, dayLabel, type, qrToken: o.qrToken(pages.length + 1), questions, content });
  const id = (rest: string) => pageId(o.child, o.number, rest);
  const pagesADay = Math.max(...plan.days.map((d) => d.pages.length));

  // Each day's book pages, known before the plan page prints them: the cover and plan come first.
  let next = 3;
  const ranges = plan.days.map((d) => {
    const range: [number, number] = [next, next + d.pages.length - 1];
    next += d.pages.length;
    return range;
  });

  add("cover", null, {
    kind: "cover", id: id("COVER"), level, child: o.child, workbook: o.number, levelTitle: o.levelTitle,
    madeFrom: o.number === 1 ? "assessment" : "last-workbook", pagesADay, minutes: { ...plan.timeTarget }, ...o.cover,
  });
  add("how-plan", null, {
    kind: "how-plan", id: id("HOW+PLAN"), level, child: o.child, workbook: o.number, pagesADay, minutes: { ...plan.timeTarget },
    rows: plan.days.map((d, i) => ({ day: d.day, ...o.planRow(d.day), pages: ranges[i] })),
  });
  const omissions: BookOmission[] = [];
  for (const d of plan.days) {
    for (const planned of d.pages) {
      const n = pages.length + 1;
      const header = o.header(d.day, planned);
      const layout = pageSlots(planned, level, { headerGrowth: headerGrowth(header, level, d.day, planned.number, d.pages.length) });
      omissions.push(...layout.omissions.map((x) => ({ ...x, page: n, day: d.day, dayPage: planned.number })));
      const filled = o.fill(d.day, planned, layout.slots);
      const questions: DraftPage["questions"] = [];
      const blocks: Block[] = filled.blocks.map((b) => ({
        ...b,
        items: b.items.map((p) => {
          const number = questions.length + 1;
          questions.push({ number, package: { ...p, ref: { source: "workbook", workbookId: o.workbookId, page: n, question: number } } });
          return number;
        }),
      }));
      add(planned.type, `Day ${d.day}`, {
        kind: "day", id: id(`D${two(d.day)}·P${planned.number}`), level, day: d.day, page: planned.number, pages: d.pages.length,
        ...header, blocks,
      }, questions);
    }
  }
  add("back-cover", null, { kind: "back-cover", id: id("BACK"), level });
  // Each blank page names its book page, so no two pages of a book share an ID.
  while (pages.length % 4 !== 0) add("blank", null, { kind: "blank", id: id(`BLANK·P${pages.length + 1}`), level });
  if (pages.length > BOOK_PAGES_MAX) throw new Error(`the book has ${pages.length} pages; at most ${BOOK_PAGES_MAX} can be stitched`);
  return { draft: { id: o.workbookId, childId: o.childId, number: o.number, levels: [level], profileBuild: o.profileBuild, pages }, omissions };
}
