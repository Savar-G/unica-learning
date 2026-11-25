// The checks of a level before it is frozen: every sheet and row of a snapshot is made with many seeds, and the widest
// question of each form is drawn at each place of its template. A sheet that passes makes no book that cannot be printed.
import { validateSnapshot, type SnapshotRow, type SnapshotSheet, type TemplateLibrary } from "../bank/snapshot";
import { inkOutside } from "../checks/blank";
import { checkDrawing } from "../checks/drawn";
import { checkFit } from "../checks/fit";
import { readPageImage } from "../checks/page-image";
import { checkTexts } from "../checks/positions";
import { checkRendering } from "../checks/rendering";
import { IMAGE_PIXELS_PER_INCH, type BookItem, type Ink, type PageModel, type Rect, type Region, type Side } from "../contract";
import type { PlannedSheet } from "../layout/build-pages";
import { TEMPLATES } from "../layout/templates";
import { RenderError, type Renderer, type Rendering } from "../renderer";
import { SHAPES, type Item, type ShapeLibrary } from "../shapes";
import { formsOf } from "../shapes/shape";
import { planPages } from "./build-book";
import { sheetItems } from "./items";

/** How many children a level is made for before it is frozen. */
export const BANK_SEEDS = 200;
/** The pages of one drawing. */
const BATCH = 100;
const SIDES: readonly Side[] = ["front", "back"];
const QR: Record<Side, string> = { front: "bank-check-front", back: "bank-check-back" };

export interface BankReport {
  /** Each names the sheet, the side and the row. */
  problems: string[];
  checked: { sheets: number; rows: number; seeds: number; questions: number; pages: number; alone: number; texts: number };
}

export interface BankOptions { shapes?: ShapeLibrary; templates?: TemplateLibrary; seeds?: number }

interface Planned { pages: PageModel[]; items: BookItem[] }
/** Pages that are drawn and checked together, for one row. */
interface Group extends Planned { owner: string }
/** A question that is drawn alone on a small page. */
interface Alone { owner: string; page: PageModel; slot: Region; number: number; side: Side }
/** A text of the row that printed it first, with the page and the rectangle that it stands in. */
interface OwnText { owner: string; page: PageModel; region: Region; ink: Ink }
type Check = (pages: PageModel[], items: BookItem[], drawn: Rendering) => string[];

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

const planned = (sheet: SnapshotSheet, levelName: string, items: BookItem[], run = 1): PlannedSheet => ({ sheet, levelName, attempt: run, qr: QR, items });

class BankCheck {
  readonly problems: string[] = [];
  readonly checked: BankReport["checked"];
  private readonly groups: Group[] = [];
  private readonly alone: Alone[] = [];
  private readonly aloneKeys = new Set<string>();
  private readonly texts: OwnText[] = [];
  private readonly textKeys = new Set<string>();
  private runs = 0;

  constructor(private readonly levelName: string, private readonly shapes: ShapeLibrary, seeds: number, private readonly renderer: Renderer) {
    this.checked = { sheets: 0, rows: 0, seeds, questions: 0, pages: 0, alone: 0, texts: 0 };
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
  private tellSeed(sheet: SnapshotSheet, seed: number, problems: readonly string[]): void {
    let told = false;
    for (const side of SIDES) {
      const only = (rows: SnapshotRow[]): SnapshotSheet => ({ ...sheet, front: { ...sheet.front, rows: [] }, back: { ...sheet.back, rows: [] }, [side]: { ...sheet[side], rows } });
      let toldRow = false;
      for (const row of sheet[side].rows) {
        const alone = this.plan(only([row]), seed, [side]);
        if (alone.ok) continue;
        this.tell(`${rowPlace(sheet, side, [row])}, seed ${seed}`, alone.problems);
        toldRow = true;
      }
      const whole = toldRow ? null : this.plan(only(sheet[side].rows), seed, [side]);
      if (whole && !whole.ok) this.tell(`${rowPlace(sheet, side, sheet[side].rows)}, seed ${seed}`, whole.problems);
      told ||= toldRow || (whole !== null && !whole.ok);
    }
    if (!told) this.tell(`Sheet "${sheet.id}", both sides, seed ${seed}`, problems);
  }

  /** Every text that the pages print, one time for each size of its place. */
  private collectTexts(sheet: SnapshotSheet, { pages, items }: Planned): void {
    const rowOf = new Map(items.map((i) => [i.id, i.rowId]));
    for (const page of pages) {
      for (const region of page.regions) {
        for (const ink of region.ink) {
          if (ink.kind !== "text" && ink.kind !== "flow") continue;
          const { w, h } = ink.rect;
          const key = ink.kind === "text" ? `${ink.text}|${ink.size}|${ink.weight}|${ink.align}|${w}|${h}` : JSON.stringify({ ...ink, rect: { w, h } });
          if (this.textKeys.has(key)) continue;
          this.textKeys.add(key);
          const rows = region.item === null ? sheet[page.side].rows : sheet[page.side].rows.filter((r) => r.id === rowOf.get(region.item ?? ""));
          this.texts.push({ owner: rowPlace(sheet, page.side, rows), page: { ...page, regions: [] }, region: { ...region, ink: [] }, ink });
        }
      }
    }
  }

  seeds(sheet: SnapshotSheet): void {
    for (let seed = 1; seed <= this.checked.seeds; seed++) {
      const plan = this.plan(sheet, seed, SIDES);
      if (!plan.ok) return this.tellSeed(sheet, seed, plan.problems);
      this.checked.questions += plan.value.items.length;
      this.collectTexts(sheet, plan.value);
    }
  }

  /** The widest question of one form at every place of both sides of its template. */
  private widest(sheet: SnapshotSheet, side: Side, row: SnapshotRow, { question, answer }: Item<unknown>): void {
    const owner = rowPlace(sheet, side, [row]);
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
    const slot = own.find((r) => r.role === "slot");
    if (!slot || this.aloneKeys.has(key)) return;
    this.aloneKeys.add(key);
    const small = alonePage(page, own, slot);
    this.alone.push({ owner, page: small, slot: small.regions.find((r) => r.role === "slot") ?? slot, number: item.number, side: item.side });
  }

  rows(sheet: SnapshotSheet): void {
    for (const side of SIDES) {
      for (const row of sheet[side].rows) {
        this.checked.rows++;
        const forms = attempt("the widest question cannot be made", () => formsOf(row.shape, row.limits));
        if (forms.ok) for (const form of forms.value) this.widest(sheet, side, row, form);
        else this.tell(rowPlace(sheet, side, [row]), forms.problems);
      }
    }
  }

  private async render(pages: readonly PageModel[]): Promise<Rendering | string[]> {
    try {
      return await this.renderer.render(pages);
    } catch (error) {
      if (error instanceof RenderError) return [error.message];
      throw error;
    }
  }

  private async problemsOf(groups: readonly Group[], check: Check): Promise<string[]> {
    const pages = groups.flatMap((g) => g.pages);
    const drawn = await this.render(pages);
    return Array.isArray(drawn) ? drawn : check(pages, groups.flatMap((g) => g.items), drawn);
  }

  /** Draws the groups in batches. A batch that fails is drawn again group by group, so that each problem has its row. */
  private async drawGroups(groups: readonly Group[], check: Check): Promise<void> {
    for (const batch of batchesOf(groups, (g) => g.pages.length)) {
      const together = await this.problemsOf(batch, check);
      if (together.length === 0) continue;
      const before = this.problems.length;
      for (const group of batch) this.tell(group.owner, batch.length === 1 ? together : await this.problemsOf([group], check));
      if (this.problems.length === before) this.tell("The rows of one drawing", together);
    }
  }

  private async drawAlones(all: readonly Alone[]): Promise<void> {
    for (const batch of batchesOf(all, () => 1)) {
      const drawn = await this.render(batch.map((a) => a.page));
      const missing = Array.isArray(drawn) ? drawn : checkRendering(batch.map((a) => a.page), drawn);
      if (Array.isArray(drawn) || missing.length > 0) {
        this.tell(batch[0].owner, missing);
        continue;
      }
      batch.forEach(({ owner, slot, number, side }, i) => {
        const problem = aloneProblem(drawn.images[i], slot);
        if (problem) this.tell(owner, [`question ${number} of the ${side} side, drawn alone${problem}.`]);
      });
    }
  }

  /** Draws what waits, when it fills a drawing or when there is no more. A level has thousands of pages, so they do not all wait. */
  async draw(last: boolean): Promise<void> {
    const pages = this.groups.reduce((sum, g) => sum + g.pages.length, 0);
    if (last || pages >= BATCH) {
      this.checked.pages += pages;
      await this.drawGroups(this.groups.splice(0), checkDrawing);
    }
    if (last || this.alone.length >= BATCH) {
      this.checked.alone += this.alone.length;
      await this.drawAlones(this.alone.splice(0));
    }
    if (!last) return;
    this.checked.texts = this.texts.length;
    const byOwner = new Map<string, OwnText[]>();
    for (const text of this.texts) byOwner.set(text.owner, [...(byOwner.get(text.owner) ?? []), text]);
    const measured = [...byOwner].flatMap(([owner, texts]) => measurePages(texts).map((page): Group => ({ owner, pages: [page], items: [] })));
    await this.drawGroups(measured, (all, _items, drawn) => [...checkTexts(all, drawn.texts), ...checkFit(all, drawn.texts)]);
  }
}

function batchesOf<T>(all: readonly T[], pagesOf: (one: T) => number): T[][] {
  const batches: T[][] = [];
  let room = 0;
  for (const one of all) {
    if (room < pagesOf(one)) {
      batches.push([]);
      room = Math.max(BATCH, pagesOf(one));
    }
    batches[batches.length - 1].push(one);
    room -= pagesOf(one);
  }
  return batches;
}

/** The clear paper around an item that is drawn alone. */
const ALONE_EDGE = 48;
/** The size of one pixel. An item is moved by whole pixels, so that its edges fall in them as they do on its page. */
const PIXEL = 72 / IMAGE_PIXELS_PER_INCH;

const movedRect = (r: Rect, dx: number, dy: number): Rect => ({ ...r, x: r.x + dx, y: r.y + dy });

/** A small empty page with nothing but the ink of one item. */
function alonePage(page: PageModel, own: readonly Region[], slot: Region): PageModel {
  const [dx, dy] = [slot.rect.x, slot.rect.y].map((at) => Math.round((ALONE_EDGE - at) / PIXEL) * PIXEL);
  const regions = own.map((r): Region => ({ ...r, rect: movedRect(r.rect, dx, dy), ink: r.ink.map((ink): Ink => ({ ...ink, rect: movedRect(ink.rect, dx, dy) })) }));
  return { ...page, size: { w: Math.ceil(slot.rect.w) + 2 * ALONE_EDGE, h: Math.ceil(slot.rect.h) + 2 * ALONE_EDGE }, regions };
}

/** Layer 2: an item alone has ink in its slot and nowhere else. */
function aloneProblem(png: Uint8Array, slot: Region): string | null {
  const image = readPageImage(png);
  if (typeof image === "string") return `: ${image}`;
  const name = `"${slot.id.slice(slot.id.lastIndexOf("/") + 1)}"`;
  if (inkOutside(image, slot.rect)) return `, has ink outside ${name}`;
  return inkOutside(image, { x: 0, y: 0, w: 0, h: 0 }) ? null : ", has no ink";
}

const MEASURE = { w: 612, gap: 4, rowsHigh: 700 };

/** Pages with nothing but texts, each in a rectangle of its own size. They are measured and not printed. */
function measurePages(texts: readonly OwnText[]): PageModel[] {
  const pages: PageModel[] = [];
  let [x, y, high] = [0, MEASURE.rowsHigh, 0];
  for (const { page, region, ink } of texts) {
    const { w, h } = ink.rect;
    if (x + w > MEASURE.w) [x, y, high] = [0, y + high + MEASURE.gap, 0];
    if (y + h > MEASURE.rowsHigh) {
      pages.push({ ...page, size: { w: Math.max(MEASURE.w, w), h: Math.max(MEASURE.rowsHigh, h) }, regions: [] });
      [x, y, high] = [0, 0, 0];
    }
    const rect = { x, y, w, h };
    pages[pages.length - 1].regions.push({ ...region, rect, ink: [{ ...ink, rect }] });
    [x, high] = [x + w + MEASURE.gap, Math.max(high, h)];
  }
  return pages;
}

/** Every problem of a snapshot, with its sheet, side and row. It changes nothing, and the same snapshot gives the same report. */
export async function checkBank(snapshot: unknown, renderer: Renderer, { shapes = SHAPES, templates = TEMPLATES, seeds = BANK_SEEDS }: BankOptions = {}): Promise<BankReport> {
  const read = attempt("The snapshot cannot be checked", () => validateSnapshot(snapshot, shapes, templates));
  const bank = read.ok ? read.value : read;
  if (!bank.ok) return { problems: bank.problems, checked: { sheets: 0, rows: 0, seeds: 0, questions: 0, pages: 0, alone: 0, texts: 0 } };
  const check = new BankCheck(bank.snapshot.level.name, shapes, seeds, renderer);
  for (const sheet of bank.snapshot.sheets.values()) {
    check.checked.sheets++;
    check.seeds(sheet);
    check.rows(sheet);
    await check.draw(false);
  }
  await check.draw(true);
  return { problems: check.problems, checked: check.checked };
}
