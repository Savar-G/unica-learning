import { isUuid, type Workbook, type WorkbookQuestion, type WorkbookSummary } from "@/lib/workbook-content";
import { packageItem, valueText, type AnswerValue, type Item, type PackageAnswer } from "@/lib/question-package";
import { confirmedWorkbookDelivery } from "@/lib/workbook-delivery-access";

export interface ParentWorkbookAnswerRequest { parentId: string; childId: string; workbookId: string }
type BookIdentity = Pick<WorkbookSummary, "id" | "parentId" | "childId" | "number" | "status">;
export interface AnswerKeyDelivery { workbookId: string; childId: string; parentId: string; number: number; deliveredAt: string }
export interface ParentWorkbookAnswerSource {
  child(id: string): Promise<{ id: string; parentId: string; firstName: string } | null>;
  workbook(id: string): Promise<BookIdentity | null>;
  /** The effective receipt, including its latest correction. A retracted receipt is null. */
  delivery(id: string): Promise<AnswerKeyDelivery | null>;
  /** Read only after the identity and delivery checks. No generation, marking or signing dependency. */
  content(id: string): Promise<Workbook | null>;
}
export interface ParentAnswer {
  part: number;
  value: string;
  alternatives: string[];
}
export interface ParentQuestionAnswer {
  number: number;
  kind: "fixed" | "example" | "open" | "unavailable";
  answers: ParentAnswer[];
  hasOpenWork: boolean;
}
export interface ParentWorkbookAnswers {
  childId: string;
  childName: string;
  workbookId: string;
  number: number;
  pages: { number: number; dayLabel: string | null; questions: ParentQuestionAnswer[] }[];
}
export const workbookAnswersPath = (child: string, workbook: string) => `/account/workbooks/${encodeURIComponent(child)}/answers/${encodeURIComponent(workbook)}`;

function written(value: AnswerValue, answer: PackageAnswer | null): string {
  const text = valueText(value);
  return answer?.unit && ["number", "fraction", "mixed", "remainder"].includes(value.type) ? `${text} ${answer.unit}` : text;
}
/** Follow stored print semantics without changing the renderer or measuring a book again. */
function answerRegions(item: Item, practiceType: string | null, measured: WorkbookQuestion["regions"]) {
  const layout = practiceType ?? (item.format === "tick-and-number" ? "mixed-set" : item.format === "spot-the-error" ? "spot-the-error" : null);
  const regions = item.regions.filter(r => r.kind === "box" || r.kind === "choice");
  if (layout === "mixed-set" || layout === "spot-the-error") {
    return [regions.find(r => r.kind === "choice"), regions.find(r => r.kind === "box")].filter(r => r !== undefined);
  }
  // This layout prints its answer regions directly, rather than through regionsSplit.
  if (layout === "word-problems") return regions;
  if (layout === "solve-it-two-ways") return regions.filter(r => r.kind === "box");
  const boxes = regions.filter(r => r.kind === "box");
  if (layout === "math-in-the-world" && boxes.length > 1) return boxes;
  const sequence = item.checks.find(c => c.kind === "sequence");
  const order = item.checks.find(c => c.kind === "order");
  const ids = new Set([...(sequence?.terms.flatMap(t => "region" in t ? [t.region] : []) ?? []), ...(order?.regions ?? [])]);
  const terms = [...ids].flatMap(id => regions.filter(r => r.id === id));
  const rest = regions.filter(r => !ids.has(r.id));
  const inRow = (r: typeof regions[number]) => !(r.kind === "box" && r.answer?.type === "text" && r.answer.value.length > 8)
    && !(r.kind === "choice" && r.choices.join(",") === "never,sometimes,always");
  const inline = [...terms, ...rest.filter(inRow)];
  const full = rest.filter(r => !inRow(r));
  if (layout === "warm-up") return inline;
  // Challenge has two printed layouts. Their frozen positions decide which answer group comes first.
  if ((layout === "challenge" || layout === null) && inline.length > 0 && full.length > 0) {
    const positions = (group: typeof regions) => group.flatMap(r => {
      const saved = measured?.find(m => m.id === r.id && m.kind === r.kind);
      return saved?.box ? [saved.box] : [];
    });
    const a = positions(inline), b = positions(full);
    if (a.length !== inline.length || b.length !== full.length) return null;
    const before = (first: typeof a, next: typeof a) => Math.max(...first.map(r => r.y + r.height)) <= Math.min(...next.map(r => r.y));
    if (before(b, a)) return [...full, ...inline];
    if (!before(a, b)) return null;
  }
  return [...inline, ...full];
}
function questionAnswer(question: WorkbookQuestion, workbookId: string, page: number): ParentQuestionAnswer {
  const unavailable: ParentQuestionAnswer = { number: question.number, kind: "unavailable", answers: [], hasOpenWork: false };
  if (question.content.status !== "found") return unavailable;
  const pkg = question.content.package, ref = pkg.ref;
  if (ref.source !== "workbook" || ref.workbookId !== workbookId || ref.page !== page || ref.question !== question.number) return unavailable;
  const item = packageItem(pkg);
  const regions = answerRegions(item, question.teaching?.practiceType ?? null, question.regions);
  if (regions === null) return unavailable;
  let part = 0;
  const answers = regions.flatMap((region): ParentAnswer[] => {
    part++;
    if (region.answer === null) return [];
    const operationAnswer = item.checks.some(check => check.kind === "operation" && check.region === region.id) ? pkg.answer : null;
    const value = typeof region.answer === "string" ? region.answer : written(region.answer, operationAnswer);
    const alternatives = operationAnswer?.accepted.map(a => written(a, operationAnswer)).filter(a => a !== value) ?? [];
    return [{ part, value, alternatives: [...new Set(alternatives)] }];
  });
  return { number: question.number, kind: answers.length === 0 ? "open" : item.checks.some(c => c.kind === "equations") ? "example" : "fixed", answers,
    hasOpenWork: item.regions.some(r => r.kind === "work" || r.kind === "lines" || r.kind === "picture" || ((r.kind === "box" || r.kind === "choice") && r.answer === null)) };
}

/** An answer-only projection, also used by the synthetic Admin view. Never returns raw packages or worksheet text. */
export function workbookAnswerPages(book: Pick<Workbook, "id" | "pages">): ParentWorkbookAnswers["pages"] | null {
  const ordered = <T extends { number: number }>(rows: readonly T[]) => [...rows].sort((a, b) => a.number - b.number);
  const validPositions = (rows: readonly { number: number }[]) => rows.every(row => Number.isSafeInteger(row.number) && row.number > 0) && new Set(rows.map(row => row.number)).size === rows.length;
  if (!validPositions(book.pages) || book.pages.some(page => !validPositions(page.questions))) return null;
  const pages = ordered(book.pages).filter(page => page.questions.length > 0).map(page => ({ number: page.number, dayLabel: page.dayLabel,
    questions: ordered(page.questions).map(q => questionAnswer(q, book.id, page.number)) }));
  return pages;
}

/** Answers only, projected from the frozen stored book. A caller cannot use another family, child or book's receipt. */
export async function readParentWorkbookAnswers(source: ParentWorkbookAnswerSource, request: ParentWorkbookAnswerRequest, now: number): Promise<ParentWorkbookAnswers | null> {
  const { parentId, childId, workbookId } = request;
  if (![parentId, childId, workbookId].every(isUuid)) return null;
  const child = await source.child(childId);
  if (!child || child.id !== childId || child.parentId !== parentId) return null;
  const owns = (book: BookIdentity | null): book is BookIdentity => !!book && book.id === workbookId && book.parentId === parentId && book.childId === childId && book.status === "shipped";
  const book = await source.workbook(workbookId);
  if (!owns(book)) return null;
  const delivered = (receipt: AnswerKeyDelivery | null) => !!receipt && receipt.parentId === parentId && receipt.childId === childId && receipt.workbookId === workbookId && receipt.number === book.number
    && confirmedWorkbookDelivery([receipt], [], childId, workbookId, now) !== null;
  if (!delivered(await source.delivery(workbookId))) return null;
  const content = await source.content(workbookId);
  if (!owns(content) || !content || content.number !== book.number) return null;
  const pages = workbookAnswerPages(content);
  if (!pages) return null;
  // A correction or retraction during the content read must apply to this request too.
  if (!delivered(await source.delivery(workbookId))) return null;
  return { childId, childName: child.firstName, workbookId, number: book.number, pages };
}
