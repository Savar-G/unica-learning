// The layout rules of a page. They read the page model and the items, never the templates, so a wrong template fails.
import { isPrintable, PAPER, partRegionName, PRINT_RULES, tokenText, wordToken, type AnswerPart, type BookItem, type FlowToken, type Ink, type PageModel, type Rect, type Region, type RegionRole } from "../contract";
import { faceBlanks, faceText, printProblems, type Area } from "./face-print";
import { framePrintProblems, labelProblems } from "./frame-print";
import { bottom, EPSILON, inside, near, overlaps, right } from "./rects";

const { spineZone, outerMargin, qrMin, reach: CLEAR, answer: ANSWER } = PRINT_RULES;

/** An answer may not stand in a blank space: its question ends at most this far above it. */
const MAX_GAP_ABOVE_ANSWER = 24;
/** An answer that stands in the line of its question starts at most this far after it. */
const MAX_GAP_BESIDE_ANSWER = 24;
/** The QR code may stand beside the scan mark of its corner. */
const QR_CORNER_ROOM = 24;
const ONE_LINE_HEIGHT = 24;

/** The last part of the id of a region, as problems show it. */
export const regionName = (region: Region) => `"${region.id.slice(region.id.lastIndexOf("/") + 1)}"`;
const textOf = (ink: Ink): string | null => (ink.kind === "text" ? ink.text : ink.kind === "flow" ? ink.tokens.map(tokenText).join(" ") : null);
const texts = (ink: readonly Ink[]) => ink.flatMap((i) => textOf(i) ?? []);
const size = (n: number) => Math.round(n * 100) / 100;

type Tell = (problem: string) => void;

/** The part of the page that may hold print: inside the margins and outside the spine zone. */
function liveArea(page: PageModel): Rect {
  const x = page.side === "front" ? spineZone : outerMargin;
  return { x, y: outerMargin, w: PAPER.w - spineZone - outerMargin, h: PAPER.h - 2 * outerMargin };
}

function checkEdges(page: PageModel, live: Rect, tell: Tell): void {
  const spineOnLeft = page.side === "front";
  for (const region of page.regions) {
    for (const rect of [region.rect, ...region.ink.map((i) => i.rect)]) {
      const overLeft = rect.x < live.x - EPSILON;
      const overRight = right(rect) > right(live) + EPSILON;
      if (spineOnLeft ? overLeft : overRight) tell(`${regionName(region)} enters the spine zone`);
      if ((spineOnLeft ? overRight : overLeft) || rect.y < live.y - EPSILON || bottom(rect) > bottom(live) + EPSILON) tell(`${regionName(region)} enters the 0.5 inch outer margin`);
    }
  }
}

/** A word is split after each of its hyphens and nowhere else, and math is not split. */
function isGoodToken(token: FlowToken): boolean {
  const text = tokenText(token);
  if (text === "" || text.trim() !== text) return false;
  return token.kind === "math" ? token.pieces.length === 1 : !text.includes(" ") && wordToken(text).pieces.join("\n") === token.pieces.join("\n");
}

function checkFlows(region: Region, tell: Tell): void {
  for (const ink of region.ink) {
    if (ink.kind !== "flow") continue;
    if (ink.tokens.length === 0) tell(`${regionName(region)} has flow text with no token`);
    for (const token of ink.tokens) if (!isGoodToken(token)) tell(`${regionName(region)} has the token "${tokenText(token)}", which may not be split like that`);
  }
}

function checkInk(page: PageModel, tell: Tell): void {
  for (const region of page.regions) {
    if (region.ink.some((i) => !inside(i.rect, region.rect))) tell(`the ink of ${regionName(region)} is outside it`);
    if (region.ink.some((i) => i.color !== "black")) tell(`${regionName(region)} has ink that is not black`);
    region.ink.forEach((ink, i) => {
      const printed = textOf(ink);
      if (printed === null) return;
      if (!isPrintable(printed)) tell(`${regionName(region)} has the text "${printed}", which the fonts cannot print`);
      if (region.ink.some((other, j) => j !== i && overlaps(ink.rect, other.rect))) tell(`the text "${printed}" of ${regionName(region)} is over other ink`);
    });
    checkFlows(region, tell);
    const mustBeEmpty = region.role === "answer" ? region.ink.some((i) => i.kind !== "outline") : (region.role === "reach" || region.role === "work" || region.role === "slot") && region.ink.length > 0;
    if (mustBeEmpty) tell(`${regionName(region)} must be empty`);
  }
}

/** Whether an answer area or a reach stands in a question that goes round it: then only the print of the question counts. */
function isInLine(question: Region, area: Region): boolean {
  return question.role === "question" && (area.role === "answer" || area.role === "reach") && inside(area.rect, question.rect) && question.ink.every((i) => !overlaps(i.rect, area.rect));
}

/** Slots, reaches and their parts lie inside each other on purpose; everything else is apart. */
function checkOverlaps(page: PageModel, inLine: ReadonlySet<string | null>, tell: Tell): void {
  page.regions.forEach((a, i) => {
    for (const b of page.regions.slice(i + 1)) {
      if (!overlaps(a.rect, b.rect)) continue;
      const sameItem = a.item !== null && a.item === b.item;
      if (sameItem && (a.role === "slot" || b.role === "slot")) continue;
      if (sameItem && inLine.has(a.item) && (isInLine(a, b) || isInLine(b, a))) continue;
      const reach = a.role === "reach" ? a : b.role === "reach" ? b : null;
      const other = reach === a ? b : a;
      if (!reach) tell(`${regionName(a)} and ${regionName(b)} overlap`);
      else if (!(sameItem && other.role === "answer" && other.part === reach.part)) tell(`${regionName(other)} enters the reach ${regionName(reach)}`);
    }
  });
}

function checkPart(page: PageModel, role: RegionRole, wanted: string | null, tell: Tell): Region | null {
  const found = page.regions.filter((r) => r.role === role);
  if (found.length !== 1) tell(`there must be one ${role}, not ${found.length}`);
  if (found.length === 0) return null;
  const printed = texts(found[0].ink).join(" ");
  if (wanted !== null && printed !== wanted) tell(`the ${role} must be "${wanted}" and it is "${printed}"`);
  return found[0];
}

function checkFrame(page: PageModel, tell: Tell): void {
  const slots = page.regions.filter((r) => r.role === "slot");
  const firstSlot = Math.min(...slots.map((s) => s.rect.y));
  const lastSlot = Math.max(...slots.map((s) => bottom(s.rect)));
  const heading = checkPart(page, "heading", `${page.topicCode} · ${page.topicTitle}`, tell);
  const instruction = checkPart(page, "instruction", page.instruction, tell);
  const footer = checkPart(page, "footer", `Level ${page.levelName} · Page ${page.page}`, tell);
  if (heading && bottom(heading.rect) > Math.min(instruction?.rect.y ?? firstSlot, firstSlot) + EPSILON) tell("the heading must be above the instruction and the questions");
  if (instruction) {
    if (bottom(instruction.rect) > firstSlot + EPSILON) tell("the instruction must be above the questions");
    if (instruction.rect.h > ONE_LINE_HEIGHT) tell("the instruction must be one line");
    if (page.instruction.length > PRINT_RULES.maxInstructionCharacters) tell(`the instruction has ${page.instruction.length} characters and the limit is ${PRINT_RULES.maxInstructionCharacters}`);
  }
  if (footer && footer.rect.y < lastSlot - EPSILON) tell("the footer must be below the questions");
  if (page.side === "front" ? page.page % 2 === 0 : page.page % 2 !== 0) tell(`a ${page.side} page must have an ${page.side === "front" ? "odd" : "even"} number`);
}

function checkQr(page: PageModel, live: Rect, tell: Tell): void {
  const qr = checkPart(page, "qr", null, tell);
  if (!qr) return;
  const outward = page.side === "front" ? right(live) - right(qr.rect) : qr.rect.x - live.x;
  const corner = page.side === "front" ? "bottom right" : "bottom left";
  if (bottom(live) - bottom(qr.rect) > QR_CORNER_ROOM || outward > QR_CORNER_ROOM || outward < -EPSILON) tell(`the QR code must be in the ${corner} corner`);
  if (Math.min(qr.rect.w, qr.rect.h) < qrMin - EPSILON) tell("the QR code is smaller than 0.6 inch");
  if (qr.ink.length === 0) tell("the QR code has no squares");
}

function checkMarks(page: PageModel, live: Rect, tell: Tell): void {
  const corners: Record<string, (r: Rect) => boolean> = {
    "mark-tl": (r) => near(r.x, live.x) && near(r.y, live.y),
    "mark-tr": (r) => near(right(r), right(live)) && near(r.y, live.y),
    "mark-br": (r) => near(right(r), right(live)) && near(bottom(r), bottom(live)),
    "mark-bl": (r) => near(r.x, live.x) && near(bottom(r), bottom(live)),
  };
  const marks = new Map(page.regions.filter((r) => r.role === "scan-mark").map((r) => [regionName(r).slice(1, -1), r]));
  const wanted = Object.keys(corners);
  if (marks.size !== wanted.length || wanted.some((w) => !marks.has(w))) tell(`the scan marks must be ${wanted.join(", ")}`);
  for (const [id, mark] of marks) if (corners[id] && !corners[id](mark.rect)) tell(`"${id}" is not in its corner`);
}

function checkArea(answer: Region, reach: Region, part: AnswerPart, tell: Tell): void {
  const { rect } = answer;
  const needed = Math.max(ANSWER.minWidth, part.value.length * ANSWER.perCharacter + ANSWER.extra);
  if (rect.w < needed - EPSILON || rect.h < ANSWER.minHeight - EPSILON) tell(`${regionName(answer)} is ${size(rect.w)} by ${size(rect.h)} points and needs ${size(needed)} by ${ANSWER.minHeight}`);
  const space: [boolean, string][] = [
    [rect.x - reach.rect.x < CLEAR.left - EPSILON, "on the left of"],
    [right(reach.rect) - right(rect) < CLEAR.right - EPSILON, "on the right of"],
    [rect.y - reach.rect.y < CLEAR.top - EPSILON, "above"],
    [bottom(reach.rect) - bottom(rect) < CLEAR.bottom - EPSILON, "below"],
  ];
  const [line, ...more] = answer.ink;
  const isOutline = line?.kind === "outline" && near(line.rect.x, rect.x) && near(line.rect.y, rect.y) && near(line.rect.w, rect.w) && near(line.rect.h, rect.h) && line.width === ANSWER.outline;
  if (!isOutline || more.length > 0) tell(`${regionName(answer)} must have one outline, which is its rectangle`);
  for (const [tooSmall, where] of space) if (tooSmall) tell(`${regionName(reach)} does not leave enough space ${where} ${regionName(answer)}`);
}

function checkBelow(answer: Region, question: Region, tell: Tell): void {
  const { rect } = answer;
  const gap = rect.y - bottom(question.rect);
  const beside = right(question.rect) <= rect.x + EPSILON || question.rect.x >= right(rect) - EPSILON;
  if (gap < -EPSILON || gap > MAX_GAP_ABOVE_ANSWER || beside) tell(`${regionName(answer)} is not directly below its question`);
}

/** The answer area is in the rectangle of its question, or directly after it in the same line. */
function checkInLine(answer: Region, question: Region, tell: Tell): void {
  const gap = answer.rect.x - right(question.rect);
  const sameLine = question.rect.y >= answer.rect.y - EPSILON && bottom(question.rect) <= bottom(answer.rect) + EPSILON;
  if (!inside(answer.rect, question.rect) && !(sameLine && gap >= -EPSILON && gap <= MAX_GAP_BESIDE_ANSWER)) tell(`${regionName(answer)} is not in the line of its question`);
}

/** Whether a reader comes to one rectangle before the other: it is in a line above, or on the left in the same line. */
const isBefore = (a: Rect, b: Rect): boolean => bottom(a) <= b.y + EPSILON || (b.y < bottom(a) && a.y < bottom(b) && right(a) <= b.x + EPSILON);

/** Whether a question stands below another one in its column. */
function isBelowAnother(page: PageModel, item: BookItem): boolean {
  const slots = page.regions.filter((r) => r.role === "slot");
  const own = slots.find((r) => r.item === item.id);
  return own !== undefined && slots.some(({ rect }) => bottom(rect) <= own.rect.y + EPSILON && rect.x < right(own.rect) - EPSILON && right(rect) > own.rect.x + EPSILON);
}

/** The work area of a stack is beside it and of a fixed size. The one of a bracket is below all digits, with room for each line of work. */
function checkWork(work: Region, { face, answer }: BookItem, question: Region, areas: ReadonlyMap<string, Area>, tell: Tell): void {
  const { rect } = work;
  if (face.kind === "column") {
    const least = PRINT_RULES.stackWork;
    if (rect.w < least.w - EPSILON || rect.h < least.h - EPSILON) tell(`${regionName(work)} is ${size(rect.w)} by ${size(rect.h)} points and needs ${least.w} by ${least.h}`);
  }
  if (face.kind !== "bracket") return;
  const needed = face.workLines * PRINT_RULES.workLine;
  if (rect.h < needed - EPSILON) tell(`${regionName(work)} is ${size(rect.h)} points high and ${face.workLines} lines of work need ${needed}`);
  const gap = rect.y - bottom(question.rect);
  if (gap < -EPSILON || gap > MAX_GAP_ABOVE_ANSWER) tell(`${regionName(work)} is not below its question`);
  const digits = areas.get(answer.parts[0]?.name)?.answer;
  if (digits && (rect.x > digits.x - PRINT_RULES.bracket.sign + EPSILON || right(rect) < right(digits) - EPSILON)) tell(`${regionName(work)} does not stand below all digits of its question`);
}

/** Each part of the answer has one answer area with one reach, and the areas come in the order of the parts. */
function checkParts(page: PageModel, item: BookItem, question: Region | undefined, tell: Tell): ReadonlyMap<string, Area> {
  const { parts } = item.answer;
  const names = parts.map((p) => p.name);
  if (parts.length === 0) tell(`question ${item.number} has no answer part`);
  if (new Set(names).size < names.length) tell(`question ${item.number} has two answer parts with one name`);
  const blanks = faceBlanks(item.face);
  if (blanks && blanks.join() !== names.join()) tell(`question ${item.number} has the blanks ${blanks.join(", ")} and the answer parts ${names.join(", ")}`);
  const own = page.regions.filter((r) => r.item === item.id);
  const areas: Region[] = [];
  const byPart = new Map<string, Area>();
  for (const part of parts) {
    const [answer, reach] = (["answer", "reach"] as const).map((role) => {
      const found = own.filter((r) => r.role === role && r.part === part.name);
      if (found.length !== 1) tell(`question ${item.number} has ${found.length === 0 ? "no" : found.length} "${role}" ${found.length === 0 ? "rectangle" : "rectangles"} for the part "${part.name}"`);
      return found.length === 1 ? found[0] : null;
    });
    if (!answer || !reach) continue;
    areas.push(answer);
    byPart.set(part.name, { answer: answer.rect, reach: reach.rect });
    checkArea(answer, reach, part, tell);
    if (question) (item.face.kind === "column" ? checkBelow : checkInLine)(answer, question, tell);
    if (item.face.kind === "bracket" && areas.length === 1 && item.face.inside.length * PRINT_RULES.cell.w > answer.rect.w + EPSILON) tell(`${regionName(answer)} is not directly above the number in its bracket`);
    if (item.face.kind === "bracket" && !near(answer.rect.y, areas[0].rect.y)) tell(`${regionName(answer)} is not in the line of ${regionName(areas[0])}`);
  }
  areas.slice(1).forEach((area, i) => {
    if (!isBefore(areas[i].rect, area.rect)) tell(`${regionName(area)} must come after ${regionName(areas[i])}`);
  });
  for (const region of own) {
    const hasPart = region.role === "answer" || region.role === "reach";
    if (hasPart ? region.part === null || !names.includes(region.part) : region.part !== null) tell(`${regionName(region)} belongs to ${region.part === null ? "no answer part" : `the answer part "${region.part}"`}`);
  }
  return byPart;
}

const ITEM_ROLES = ["slot", "label", "question"] as const;

function checkItem(page: PageModel, item: BookItem, tell: Tell): void {
  const parts = new Map<RegionRole, Region>();
  // A stack and a bracket with lines of work are worked on the page. All other questions are worked in the head.
  const workLines = item.face.kind === "bracket" ? item.face.workLines : 0;
  for (const role of item.face.kind === "column" || workLines > 0 ? [...ITEM_ROLES, "work" as const] : ITEM_ROLES) {
    const found = page.regions.filter((r) => r.item === item.id && r.role === role);
    if (found.length === 0) tell(`question ${item.number} has no "${role}" rectangle`);
    else if (found.length > 1) tell(`question ${item.number} has ${found.length} "${role}" rectangles`);
    else parts.set(role, found[0]);
  }
  const [slot, label, question] = ITEM_ROLES.map((role) => parts.get(role));
  if (slot) for (const part of page.regions.filter((r) => r.item === item.id)) if (!inside(part.rect, slot.rect)) tell(`${regionName(part)} is not inside ${regionName(slot)}`);
  if (label && texts(label.ink).join("") !== String(item.number)) tell(`question ${item.number} has the label "${texts(label.ink).join("")}"`);
  if (question) {
    const printed = texts(question.ink).join("");
    const wanted = faceText(item.face);
    if (printed !== wanted) tell(`question ${item.number} prints "${printed}" and must print "${wanted}"`);
  }
  const areas = checkParts(page, item, question, tell);
  if (!question) return;
  if (label && slot) for (const problem of labelProblems(item.face, label, slot, question, areas)) tell(`question ${item.number}: ${problem}`);
  for (const problem of printProblems(item.face, question, areas, isBelowAnother(page, item))) tell(`question ${item.number} ${problem}`);
  const work = parts.get("work");
  if (work) checkWork(work, item, question, areas, tell);
}

const QUESTION_ROLES: readonly RegionRole[] = ["slot", "label", "question", "answer", "reach", "work"];

/** Each rectangle says by its fields and by its whole id what it is. Two with one id would be one in the record of a page. */
function checkIds(page: PageModel, items: ReadonlyMap<string | null, BookItem>, tell: Tell): void {
  const ids = new Set<string>();
  const name = (region: Region): string => {
    const item = items.get(region.item);
    if (QUESTION_ROLES.includes(region.role)) {
      if (!item) tell(`${regionName(region)} belongs to no question of this page`);
      return item ? partRegionName(region.role, item.number, region.part) : regionName(region).slice(1, -1);
    }
    if (region.item !== null || region.part !== null) tell(`${regionName(region)} must belong to no question`);
    return region.role === "scan-mark" ? regionName(region).slice(1, -1) : region.role;
  };
  for (const region of page.regions) {
    const wanted = `${page.id}/${name(region)}`;
    if (region.id !== wanted) tell(`"${region.id}" must be named "${wanted}"`);
    if (ids.has(region.id)) tell(`two rectangles are named ${regionName(region)}`);
    ids.add(region.id);
  }
}

function checkColumns(page: PageModel, tell: Tell): void {
  const lefts: number[] = [];
  for (const { rect } of page.regions.filter((r) => r.role === "answer")) if (!lefts.some((x) => near(x, rect.x))) lefts.push(rect.x);
  if (lefts.length > PRINT_RULES.maxAnswerColumns) tell(`there are ${lefts.length} answer columns and the limit is ${PRINT_RULES.maxAnswerColumns}`);
}

/** The problems of one page, in plain words. `items` may hold the items of other pages too. */
export function checkPage(page: PageModel, items: readonly BookItem[]): string[] {
  const problems: string[] = [];
  const tell: Tell = (problem) => {
    const text = `Page ${page.page}: ${problem}.`;
    if (!problems.includes(text)) problems.push(text);
  };
  if (page.size.w !== PAPER.w || page.size.h !== PAPER.h) tell(`the paper must be ${PAPER.w} by ${PAPER.h} points`);
  const live = liveArea(page);
  checkEdges(page, live, tell);
  checkInk(page, tell);
  checkFrame(page, tell);
  checkQr(page, live, tell);
  checkMarks(page, live, tell);
  for (const problem of framePrintProblems(page, live)) tell(problem);
  checkColumns(page, tell);
  const onPage = items.filter((i) => i.sheetId === page.sheetId && i.side === page.side && i.id.startsWith(`${page.id}/`));
  checkOverlaps(page, new Set(onPage.filter((i) => i.face.kind !== "column").map((i) => i.id)), tell);
  checkIds(page, new Map(onPage.map((i) => [i.id, i])), tell);
  if (onPage.length === 0) tell("the page has no question");
  for (const item of onPage) checkItem(page, item, tell);
  return problems;
}
