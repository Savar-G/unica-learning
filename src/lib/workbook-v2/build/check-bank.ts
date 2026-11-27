// The checks of a level before it is frozen: every sheet and row of a snapshot is made with many seeds, the widest question
// of each form is drawn at each place of its template, and every text that a row can print is measured in its place. A
// sheet that passes makes no book that cannot be printed.
import { ShapeFault, validateSnapshot, type SnapshotResult, type SnapshotRow, type SnapshotSheet, type TemplateLibrary } from "../bank/snapshot";
import { checkDrawing } from "../checks/drawn";
import { flowProblems, textProblem } from "../checks/fit";
import { checkItemImage } from "../checks/images";
import { regionName } from "../checks/page-rules";
import { checkImageFiles, checkReport } from "../checks/rendering";
import { placeTexts } from "../checks/texts";
import { IMAGE_PIXELS_PER_INCH, PAPER, type BookItem, type Ink, type PageModel, type Rect, type Region, type Side } from "../contract";
import type { PlannedSheet } from "../layout/build-pages";
import { TEMPLATES } from "../layout/templates";
import { RenderError, type Renderer } from "../renderer";
import { SHAPES, type Item, type ShapeLibrary } from "../shapes";
import { formsOf, questionKey } from "../shapes/shape";
import { seedFrom } from "../hash";
import { planPages } from "./build-book";
import { itemRegions } from "../layout/build-pages";
import { STORY_SHAPE_ID } from "../shapes/story";
import { interestsOf } from "../themes/bind";
import { bindSheet } from "../themes/sheets";
import { DEFAULT_INTEREST, type StoryBank } from "../themes/types";
import { sheetItems } from "./items";
import { rowTexts } from "./row-texts";
import { eachDigit, storyCombos } from "./story-combos";

/** How many children a level is made for before it is frozen. */
export const BANK_SEEDS = 200;
/**
 * A drawn figure is fitted with the widest question of each form, and its other questions are drawn too: this many seeds of
 * each row with a figure, each question one time, at every place of both sides, together and alone.
 */
export const FIGURE_SAMPLE_SEEDS = 5;
/** The pages of one drawing. */
const BATCH = 100;
const SIDES: readonly Side[] = ["front", "back"];
const QR: Record<Side, string> = { front: "bank-check-front", back: "bank-check-back" };

export interface BankReport {
  /** Each names the sheet, the side and the row. */
  problems: string[];
  /** `samples` are the questions of sampled seeds that are drawn as the widest ones are. */
  checked: { sheets: number; rows: number; seeds: number; questions: number; pages: number; alone: number; texts: number; samples: number };
}

/** `figureSamples` is how many seeds of each row with a figure are drawn: `FIGURE_SAMPLE_SEEDS` for a freeze. */
export interface BankOptions { shapes?: ShapeLibrary; templates?: TemplateLibrary; seeds?: number; figureSamples?: number }

interface Planned { pages: PageModel[]; items: BookItem[] }
/** Pages that are drawn and checked together, for one row. */
interface Group extends Planned { owner: string }
/** A question that is drawn alone on a small page. */
interface Alone { owner: string; page: PageModel; slot: Region; number: number; side: Side }
/** A text, and where each row prints it first. */
interface Measured { ink: Ink; owners: Map<string, { name: string; side: Side }> }

const rowPlace = (sheet: SnapshotSheet, side: Side, rows: readonly { id: string }[]): string => `Sheet "${sheet.id}", ${side} side, row${rows.length === 1 ? "" : "s"} ${rows.map((r) => `"${r.id}"`).join(", ")}`;
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

type Made<T> = { ok: true; value: T } | { ok: false; problems: string[] };

/** What a step gives, or why it cannot be done. A shape is code from outside this check, and one that fails is a problem of its row. */
function attempt<T>(what: string, step: () => T): Made<T> {
  try {
    return { ok: true, value: step() };
  } catch (error) {
    return { ok: false, problems: [`${what} (${messageOf(error)}).`] };
  }
}

/** The same for a drawing: only a problem of the typesetter is one of the bank. */
async function drawing<T>(step: () => Promise<T>): Promise<Made<T>> {
  try {
    return { ok: true, value: await step() };
  } catch (error) {
    if (error instanceof RenderError) return { ok: false, problems: [error.message] };
    throw error;
  }
}

/** Any sheet can start a day of a book, so the front page of each one is checked with the time log. */
const planned = (sheet: SnapshotSheet, levelName: string, items: BookItem[], run = 1): PlannedSheet => ({ sheet, levelName, attempt: run, qr: QR, items, startsDay: true });

class BankCheck {
  readonly problems: string[] = [];
  readonly checked: BankReport["checked"];
  private readonly groups: Group[] = [];
  private readonly alone: Alone[] = [];
  private readonly aloneKeys = new Set<string>();
  private readonly texts = new Map<string, Measured>();
  private runs = 0;

  constructor(private readonly levelName: string, private readonly shapes: ShapeLibrary, seeds: number, private readonly renderer: Renderer, private readonly figureSamples: number, private readonly stories: StoryBank | null) {
    this.checked = { sheets: 0, rows: 0, seeds, questions: 0, pages: 0, alone: 0, texts: 0, samples: 0 };
  }

  private tell(owner: string, problems: readonly string[]): void {
    for (const problem of problems) this.problems.push(`${owner}: ${problem}`);
  }

  /** The pages of some sides of a sheet for one seed, or why there are none. */
  private plan(sheet: SnapshotSheet, seed: number, sides: readonly Side[]): Made<Planned> {
    const items = attempt("a question cannot be made", () => sheetItems(sheet, `bank-check-${seed}`, 1));
    if (!items.ok) return items;
    const plan = attempt("a question cannot be printed", () => planPages([planned(sheet, this.levelName, items.value)], this.shapes, sides));
    if (!plan.ok) return plan;
    return plan.value.ok ? { ok: true, value: { pages: plan.value.pages, items: items.value } } : plan.value;
  }

  /** The first seed that fails, told for each row that fails alone, or for the sides of the sheet. */
  private tellSeed(sheet: SnapshotSheet, seed: number, problems: readonly string[], label: string): void {
    let told = false;
    for (const side of SIDES) {
      const only = (rows: SnapshotRow[]): SnapshotSheet => ({ ...sheet, front: { ...sheet.front, rows: [] }, back: { ...sheet.back, rows: [] }, [side]: { ...sheet[side], rows } });
      let toldRow = false;
      for (const row of sheet[side].rows) {
        const alone = this.plan(only([row]), seed, [side]);
        if (alone.ok) continue;
        this.tell(`${rowPlace(sheet, side, [row])}${label}, seed ${seed}`, alone.problems);
        toldRow = true;
      }
      const whole = toldRow ? null : this.plan(only(sheet[side].rows), seed, [side]);
      if (whole && !whole.ok) this.tell(`${rowPlace(sheet, side, sheet[side].rows)}${label}, seed ${seed}`, whole.problems);
      told ||= toldRow || (whole !== null && !whole.ok);
    }
    if (!told) this.tell(`Sheet "${sheet.id}", both sides${label}, seed ${seed}`, problems);
  }

  /** A text to measure, one time for each size of its place. */
  private measure(owner: string, ink: Ink, name: string, side: Side): void {
    if (ink.kind !== "text" && ink.kind !== "flow") return;
    const { w, h } = ink.rect;
    const key = ink.kind === "text" ? `${ink.text}|${ink.size}|${ink.weight}|${ink.align}|${w}|${h}` : JSON.stringify({ ...ink, rect: { w, h } });
    const known = this.texts.get(key);
    if (!known) this.texts.set(key, { ink, owners: new Map([[owner, { name, side }]]) });
    else if (!known.owners.has(owner)) known.owners.set(owner, { name, side });
  }

  /**
   * The sheet for each seed. `label` names the region and the theme of a sheet of word problems. Flow text is not measured
   * here: only word problems print it, and `storyRow` measures every text that their numbers can make.
   */
  seeds(sheet: SnapshotSheet, label = ""): void {
    for (let seed = 1; seed <= this.checked.seeds; seed++) {
      const plan = this.plan(sheet, seed, SIDES);
      if (!plan.ok) return this.tellSeed(sheet, seed, plan.problems, label);
      const { pages, items } = plan.value;
      this.checked.questions += items.length;
      const ownerOf = new Map<string | null, string>(items.map((i) => [i.id, rowPlace(sheet, i.side, [{ id: i.rowId }])]));
      for (const page of pages) {
        const whole = rowPlace(sheet, page.side, sheet[page.side].rows);
        for (const region of page.regions) for (const ink of region.ink) if (ink.kind !== "flow") this.measure(ownerOf.get(region.item) ?? whole, ink, regionName(region).slice(1, -1), page.side);
      }
    }
  }

  /** The seeds of a sheet for each region and theme of its word problems, or once for a sheet with none. */
  sheetSeeds(sheet: SnapshotSheet): void {
    const hasStory = SIDES.some((side) => sheet[side].rows.some((row) => row.shape.id === STORY_SHAPE_ID));
    if (!hasStory || !this.stories) return this.seeds(sheet);
    for (const region of this.stories.packs.keys()) {
      for (const interest of interestsOf(this.stories)) this.seeds(bindSheet(sheet, this.stories, { region, interest }), `, region "${region}", scenario "${interest}"`);
    }
  }

  /** One question at every place of both sides of its template: the widest question of a form, or one of a sampled seed. */
  private everywhere(sheet: SnapshotSheet, side: Side, row: SnapshotRow, { question, answer }: Item<unknown>, label = ""): void {
    const owner = `${rowPlace(sheet, side, [row])}${label}`;
    const run = ++this.runs;
    const { shape } = row;
    const { template } = sheet[side];
    const both: SnapshotSheet = { ...sheet, front: sheet[side], back: sheet[side] };
    const made = attempt("the widest question cannot be printed", () => {
      const item = { sheetId: sheet.id, rowId: row.id, shape: shape.id, shapeVersion: shape.version, question, answer, face: shape.face(question), steps: shape.steps(question), difficulty: shape.difficulty(question) };
      const items = SIDES.flatMap((s) => template.sides[s].places.map((_, i): BookItem => ({ ...item, id: `${sheet.id}/${run}/${s}/${i + 1}`, side: s, number: i + 1 })));
      return { items, plan: planPages([planned(both, this.levelName, items, run)], this.shapes) };
    });
    if (!made.ok) return this.tell(owner, made.problems);
    const { items, plan } = made.value;
    if (!plan.ok) return this.tell(owner, plan.problems);
    this.groups.push({ owner, pages: plan.pages, items });
    for (const page of plan.pages) for (const item of items) if (item.side === page.side) this.drawAlone(owner, page, item, template.id);
  }

  private drawAlone(owner: string, page: PageModel, item: BookItem, template: string): void {
    const key = [template, item.side, item.number, JSON.stringify([item.face, item.answer])].join("|");
    const own = page.regions.filter((r) => r.item === item.id);
    if (this.aloneKeys.has(key)) return;
    this.aloneKeys.add(key);
    const small = alonePage(page, own);
    if (small) this.alone.push({ owner, ...small, number: item.number, side: item.side });
    else this.tell(owner, [`question ${item.number} of the ${item.side} side has no slot to be drawn in.`]);
  }

  /**
   * Every combination of a row of word problems, drawn at every place of both sides with every check of a book and alone,
   * and its text measured with every digit in each place of its numbers. A problem names the combination and the place.
   */
  private storyRow(sheet: SnapshotSheet, side: Side, row: SnapshotRow): void {
    const owner = rowPlace(sheet, side, [row]);
    const combos = this.stories ? attempt("the word problems cannot be made", () => storyCombos(row, this.stories as StoryBank)) : { ok: false as const, problems: ["the snapshot has no word problems."] };
    if (!combos.ok) return this.tell(owner, combos.problems);
    if (combos.value.length === 0) return this.tell(owner, ["nothing was drawn, because no question of the row has a scenario and a region pack."]);
    const { template } = sheet[side];
    for (const { label, item } of combos.value) {
      this.everywhere(sheet, side, row, item, `, ${label}`);
      const face = row.shape.face(item.question);
      for (const at of SIDES) {
        template.sides[at].places.forEach((place, i) => {
          for (const region of itemRegions(place, { id: "", number: i + 1, face, answer: item.answer }, (name) => name)) {
            for (const ink of region.ink) {
              if (ink.kind !== "flow") continue;
              for (const { tokens, room } of eachDigit(ink.tokens, ink.size)) this.measure(`${owner}, ${label}`, { ...ink, tokens, rect: { ...ink.rect, w: ink.rect.w - room } }, region.id, at);
            }
          }
        });
      }
    }
  }

  private row(sheet: SnapshotSheet, side: Side, row: SnapshotRow): void {
    if (row.shape.id === STORY_SHAPE_ID) return this.storyRow(sheet, side, row);
    const owner = rowPlace(sheet, side, [row]);
    const before = this.problems.length;
    const forms = attempt("the widest question cannot be made", () => formsOf(row.shape, row.limits));
    if (!forms.ok) return this.tell(owner, forms.problems);
    const texts = attempt("the texts of the row cannot be made", () => rowTexts(row, sheet[side].template));
    if (texts.ok) for (const { ink, name, side: at } of texts.value.texts) this.measure(owner, ink, name, at);
    this.tell(owner, texts.ok ? texts.value.problems : texts.problems);
    const runs = this.runs;
    for (const form of forms.value) this.everywhere(sheet, side, row, form);
    if (this.runs === runs && this.problems.length === before) this.tell(owner, ["nothing was drawn, because the shape gives no form of its questions."]);
    if (forms.value.some(({ question }) => row.shape.face(question).kind === "figure")) this.samples(sheet, side, row, forms.value);
  }

  /** The questions of some seeds of a row with a figure, each one time, and none that is a widest question already. */
  private samples(sheet: SnapshotSheet, side: Side, row: SnapshotRow, forms: readonly Item<unknown>[]): void {
    const owner = rowPlace(sheet, side, [row]);
    const drawn = new Set(forms.map(({ question }) => questionKey(row.shape, question)));
    for (let seed = 1; seed <= this.figureSamples; seed++) {
      const made = attempt("a question of a sampled seed cannot be made", () => row.shape.generate(row.limits, seedFrom("bank-check-figure", sheet.id, side, row.id, seed)));
      if (!made.ok) return this.tell(owner, made.problems);
      const key = questionKey(row.shape, made.value.question);
      if (drawn.has(key)) continue;
      drawn.add(key);
      this.checked.samples++;
      this.everywhere(sheet, side, row, made.value);
    }
  }

  rows(sheet: SnapshotSheet): void {
    for (const side of SIDES) {
      for (const row of sheet[side].rows) {
        this.checked.rows++;
        this.row(sheet, side, row);
      }
    }
  }

  private async groupProblems(groups: readonly Group[]): Promise<string[]> {
    const [pages, items] = [groups.flatMap((g) => g.pages), groups.flatMap((g) => g.items)];
    const drawn = await drawing(() => this.renderer.render(pages));
    return drawn.ok ? checkDrawing(pages, items, drawn.value) : drawn.problems;
  }

  /** Each problem of some questions that are drawn alone, or why they could not be drawn. */
  private async aloneProblems(batch: readonly Alone[]): Promise<{ told: [Alone, string][] } | { failed: string[] }> {
    const pages = batch.map((a) => a.page);
    const drawn = await drawing(() => this.renderer.images(pages));
    const failed = drawn.ok ? checkImageFiles(pages, drawn.value) : drawn.problems;
    if (!drawn.ok || failed.length > 0) return { failed };
    return { told: batch.flatMap((one, i) => checkItemImage(one.page, one.slot, drawn.value[i]).map((problem): [Alone, string] => [one, problem])) };
  }

  private async textProblems(batch: readonly Measured[]): Promise<{ told: [Measured, string][] } | { failed: string[] }> {
    const { pages, textOf } = measurePages(batch);
    const drawn = await drawing(() => this.renderer.report(pages));
    const failed = drawn.ok ? checkReport(pages, drawn.value) : drawn.problems;
    if (!drawn.ok || failed.length > 0) return { failed };
    const placed = placeTexts(pages, drawn.value.texts);
    const found = new Set<Measured>();
    const told: [Measured, string][] = [];
    const tell = (region: Region, problems: readonly string[]) => {
      const text = textOf.get(region.id);
      if (!text) return;
      found.add(text);
      for (const problem of problems) told.push([text, problem]);
    };
    for (const one of placed.texts) tell(one.region, [textProblem(one) ?? []].flat());
    for (const flow of placed.flows) tell(flow.region, flowProblems(flow));
    return { told: [...told, ...batch.flatMap((text): [Measured, string][] => (found.has(text) ? [] : [[text, "was not drawn as the model says it"]]))] };
  }

  /** Draws in batches. A batch that cannot be drawn is drawn again one by one, so that each problem has its row. */
  private async drawBatches<T>(all: readonly T[], size: (one: T) => number, check: (batch: readonly T[]) => Promise<string[]>, tellOne: (one: T, problems: string[]) => void, ownersOf: (one: T) => string[]): Promise<void> {
    for (const batch of batchesOf(all, size)) {
      const together = await check(batch);
      if (together.length === 0) continue;
      const before = this.problems.length;
      for (const one of batch) tellOne(one, batch.length === 1 ? together : await check([one]));
      if (this.problems.length === before) this.tell(`${[...new Set(batch.flatMap(ownersOf))].join(" and ")}, drawn together`, together);
    }
  }

  private async drawAlones(all: readonly Alone[]): Promise<void> {
    const tellOne = ({ owner, number, side }: Alone, problems: string[]) => this.tell(owner, problems.map((problem) => `question ${number} of the ${side} side, drawn alone: ${problem.replace(/\.$/, "")}.`));
    await this.drawBatches(all, () => 1, async (batch) => {
      const result = await this.aloneProblems(batch);
      if ("failed" in result) return result.failed;
      for (const [one, problem] of result.told) tellOne(one, [problem]);
      return [];
    }, tellOne, ({ owner }) => [owner]);
  }

  private async measureAll(all: readonly Measured[]): Promise<void> {
    const tellOne = ({ ink, owners }: Measured, problems: string[]) => {
      for (const [owner, { name, side }] of owners) this.tell(owner, problems.map((problem) => (ink.kind === "text" ? `the text "${ink.text}" of "${name}" of the ${side} side ${problem.replace(/\.$/, "")}.` : `the flow text of "${name}" of the ${side} side: ${problem.replace(/\.$/, "")}.`)));
    };
    await this.drawBatches(all, () => 1 / TEXTS_OF_A_PAGE, async (batch) => {
      const result = await this.textProblems(batch);
      if ("failed" in result) return result.failed;
      for (const [one, problem] of result.told) tellOne(one, [problem]);
      return [];
    }, tellOne, ({ owners }) => [...owners.keys()]);
  }

  /** Draws what waits, when it fills a drawing or when there is no more. A level has thousands of pages, so they do not all wait. */
  async draw(last: boolean): Promise<void> {
    const pages = this.groups.reduce((sum, g) => sum + g.pages.length, 0);
    if (last || pages >= BATCH) {
      this.checked.pages += pages;
      await this.drawBatches(this.groups.splice(0), (g) => g.pages.length, (batch) => this.groupProblems(batch), ({ owner }, problems) => this.tell(owner, problems), ({ owner }) => [owner]);
    }
    if (last || this.alone.length >= BATCH) {
      this.checked.alone += this.alone.length;
      await this.drawAlones(this.alone.splice(0));
    }
    if (!last) return;
    this.checked.texts = this.texts.size;
    await this.measureAll([...this.texts.values()]);
  }
}

function batchesOf<T>(all: readonly T[], size: (one: T) => number): T[][] {
  const batches: T[][] = [];
  let room = 0;
  for (const one of all) {
    if (room < size(one)) {
      batches.push([]);
      room = Math.max(BATCH, size(one));
    }
    batches[batches.length - 1].push(one);
    room -= size(one);
  }
  return batches;
}

/** The clear paper around an item that is drawn alone. */
const ALONE_EDGE = 48;
/** The size of one pixel. An item is moved by whole pixels, so that its edges fall in them as they do on its page. */
const PIXEL = 72 / IMAGE_PIXELS_PER_INCH;

const movedRect = (r: Rect, dx: number, dy: number): Rect => ({ ...r, x: r.x + dx, y: r.y + dy });

/** A small empty page with nothing but the ink of one item. Its size is in whole pixels. */
function alonePage(page: PageModel, own: readonly Region[]): { page: PageModel; slot: Region } | null {
  const place = own.find((r) => r.role === "slot");
  if (!place) return null;
  const [dx, dy] = [place.rect.x, place.rect.y].map((at) => Math.round((ALONE_EDGE - at) / PIXEL) * PIXEL);
  const regions = own.map((r): Region => ({ ...r, rect: movedRect(r.rect, dx, dy), ink: r.ink.map((ink): Ink => ({ ...ink, rect: movedRect(ink.rect, dx, dy) })) }));
  const slot = regions.find((r) => r.role === "slot");
  const size = (length: number) => Math.ceil((length + 2 * ALONE_EDGE) / PIXEL) * PIXEL;
  // The question is alone: the time log of its page is not drawn, so it has no capture either.
  return slot ? { page: { ...page, size: { w: size(place.rect.w), h: size(place.rect.h) }, regions, captures: [] }, slot } : null;
}

const MEASURE = { gap: 4, high: 700 };
/** About how many texts a page of them has. It only decides the size of a batch. */
const TEXTS_OF_A_PAGE = 50;

/** Pages with nothing but texts, each in a rectangle of its own size. They are measured and not printed. */
function measurePages(texts: readonly Measured[]): { pages: PageModel[]; textOf: Map<string, Measured> } {
  const pages: PageModel[] = [];
  const textOf = new Map<string, Measured>();
  let [x, y, high] = [0, MEASURE.high, 0];
  for (const text of texts) {
    const { w, h } = text.ink.rect;
    if (x + w > PAPER.w) [x, y, high] = [0, y + high + MEASURE.gap, 0];
    if (y + h > MEASURE.high) {
      const id = `measure-${pages.length + 1}`;
      pages.push({ id, sheetId: id, attempt: 1, side: "front", page: pages.length + 1, levelName: "", topicCode: "", topicTitle: "", instruction: "", template: "", qr: "", size: { w: Math.max(PAPER.w, w), h: Math.max(MEASURE.high, h) }, regions: [], captures: [] });
      [x, y, high] = [0, 0, 0];
    }
    const id = `measure/${textOf.size + 1}`;
    const rect = { x, y, w, h };
    textOf.set(id, text);
    pages[pages.length - 1].regions.push({ id, role: "question", rect, item: null, part: null, ink: [{ ...text.ink, rect }] });
    [x, high] = [x + w + MEASURE.gap, Math.max(high, h)];
  }
  return { pages, textOf };
}

function readBank(snapshot: unknown, shapes: ShapeLibrary, templates: TemplateLibrary): SnapshotResult {
  try {
    return validateSnapshot(snapshot, shapes, templates);
  } catch (error) {
    if (error instanceof ShapeFault) return { ok: false, problems: [`${error.message}.`] };
    throw error;
  }
}

/** Every problem of a snapshot, with its sheet, side and row. It changes nothing, and the same snapshot gives the same report. */
export async function checkBank(snapshot: unknown, renderer: Renderer, { shapes = SHAPES, templates = TEMPLATES, seeds = BANK_SEEDS, figureSamples = FIGURE_SAMPLE_SEEDS }: BankOptions = {}): Promise<BankReport> {
  const bank = readBank(snapshot, shapes, templates);
  if (!bank.ok) return { problems: bank.problems, checked: { sheets: 0, rows: 0, seeds: 0, questions: 0, pages: 0, alone: 0, texts: 0, samples: 0 } };
  const check = new BankCheck(bank.snapshot.level.name, shapes, seeds, renderer, figureSamples, bank.snapshot.stories);
  for (const sheet of bank.snapshot.sheets.values()) {
    check.checked.sheets++;
    check.sheetSeeds(sheet);
    check.rows(sheet);
    await check.draw(false);
  }
  await check.draw(true);
  return { problems: check.problems, checked: check.checked };
}
