import { describe, expect, it } from "vitest";
import { DESK_HOME, deskGate, deskView, lockCookie, openPageToken, readLock, tapAreas } from "@/lib/desk";
import { sampleWorkbook } from "@/lib/workbook-sample";
import { memoryWorkbookStore } from "@/lib/workbook-store-memory";

// The child's desk (#301, spec #295), through its interface, over the in-memory workbook store: which workbooks and
// which page the desk shows, the tap areas of the questions, the page QR codes, and the desk lock that sends every other
// account page back to the desk until the parent's PIN ends it.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const SIBLING = "33333333-3333-4333-8333-333333333333";
const OTHER_PARENT = "44444444-4444-4444-8444-444444444444";
const OTHER_CHILD = "55555555-5555-4555-8555-555555555555";
const FIRST = "66666666-6666-4666-8666-666666666666";
const SECOND = "77777777-7777-4777-8777-777777777777";
const THIRD = "88888888-8888-4888-8888-888888888888";
const SIBLINGS_BOOK = "99999999-9999-4999-8999-999999999999";
const OTHER_BOOK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const token = (book: string, page: number) => `${book.slice(0, 8)}-page-${page}`.padEnd(20, "x");

async function family() {
  const store = memoryWorkbookStore({
    children: [{ id: CHILD, parentId: PARENT }, { id: SIBLING, parentId: PARENT }, { id: OTHER_CHILD, parentId: OTHER_PARENT }],
    now: () => new Date("2026-10-29T18:00:00Z"),
  });
  const add = async (workbookId: string, childId: string, parentId: string, number: number) => {
    const written = await store.write(sampleWorkbook({ workbookId, childId, parentId, number, qrTokens: [1, 2, 3].map((p) => token(workbookId, p)) }));
    expect(written.status).toBe("written");
  };
  await add(FIRST, CHILD, PARENT, 1);
  await add(SECOND, CHILD, PARENT, 2);
  await add(THIRD, CHILD, PARENT, 3);
  await add(SIBLINGS_BOOK, SIBLING, PARENT, 1);
  await add(OTHER_BOOK, OTHER_CHILD, OTHER_PARENT, 1);
  // Workbook 3 is still being made; the others have reached the family.
  for (const id of [FIRST, SECOND, SIBLINGS_BOOK, OTHER_BOOK]) store.setStatus(id, "shipped");
  return store;
}

describe("the desk view", () => {
  it("shows only the child's shipped workbooks, newest first, and opens the newest", async () => {
    const view = await deskView(await family(), { parentId: PARENT, childId: CHILD });
    if (view.status !== "ready") throw new Error(`expected a desk, got ${view.status}`);
    expect(view.workbooks.map((w) => [w.id, w.number])).toEqual([[SECOND, 2], [FIRST, 1]]);
    expect(view.workbook.id).toBe(SECOND);
  });

  it("opens on the first page with questions, and lists every page of the workbook", async () => {
    const view = await deskView(await family(), { parentId: PARENT, childId: CHILD });
    if (view.status !== "ready") throw new Error(view.status);
    expect(view.page.number).toBe(2);
    expect(view.page.dayLabel).toBe("Day 1");
    expect(view.page.image).toEqual({ path: `${PARENT}/${SECOND}/page-2.png`, width: 850, height: 1100 });
    expect(view.pages).toEqual([1, 2, 3]);
  });

  it("switches to an older workbook and a page the child asks for", async () => {
    const view = await deskView(await family(), { parentId: PARENT, childId: CHILD, workbookId: FIRST, page: 3 });
    if (view.status !== "ready") throw new Error(view.status);
    expect([view.workbook.id, view.page.number]).toEqual([FIRST, 3]);
    expect(view.page.questions.map((q) => q.text)).toEqual(["532 − 178 = ?", "704 − 256 = ?", "615 − 349 = ?", "823 − 467 = ?"]);
    expect(view.notice).toBeNull();
  });

  it("never opens a workbook that is not shipped, or another child's, and says so", async () => {
    const store = await family();
    for (const workbookId of [THIRD, SIBLINGS_BOOK, OTHER_BOOK]) {
      const view = await deskView(store, { parentId: PARENT, childId: CHILD, workbookId, page: 2 });
      if (view.status !== "ready") throw new Error(view.status);
      expect(view.workbook.id, workbookId).toBe(SECOND);
      expect(view.notice).toBe("not-this-child");
    }
  });

  it("opens the first page with questions when the page asked for is not in the workbook", async () => {
    const view = await deskView(await family(), { parentId: PARENT, childId: CHILD, workbookId: FIRST, page: 40 });
    if (view.status !== "ready") throw new Error(view.status);
    expect([view.workbook.id, view.page.number]).toEqual([FIRST, 2]);
  });

  it("opens the cover when the parent asks for it", async () => {
    const view = await deskView(await family(), { parentId: PARENT, childId: CHILD, page: 1 });
    if (view.status !== "ready") throw new Error(view.status);
    expect(view.page.number).toBe(1);
    expect(view.page.questions).toEqual([]);
  });

  it("has nothing to show for a child with no shipped workbook, or another family's child", async () => {
    const store = await family();
    store.setStatus(FIRST, "printed");
    store.setStatus(SECOND, "approved");
    expect(await deskView(store, { parentId: PARENT, childId: CHILD })).toEqual({ status: "no-workbook" });
    expect(await deskView(store, { parentId: PARENT, childId: OTHER_CHILD })).toEqual({ status: "no-workbook" });
  });

  it("never shows a question's answer", async () => {
    const view = await deskView(await family(), { parentId: PARENT, childId: CHILD });
    if (view.status !== "ready") throw new Error(view.status);
    expect(JSON.stringify(view)).not.toContain("612");
  });
});

describe("tap areas", () => {
  it("places each question's area where its box is on the page image, in percent", async () => {
    const view = await deskView(await family(), { parentId: PARENT, childId: CHILD });
    if (view.status !== "ready") throw new Error(view.status);
    const areas = tapAreas(view.page);
    expect(areas.map((a) => a.question)).toEqual([1, 2, 3, 4]);
    // Question 2 of a sample practice page: the box at x 440, y 230, 350 by 360, on an 850 by 1100 image.
    expect(areas[1]).toEqual({ question: 2, left: 51.765, top: 20.909, width: 41.176, height: 32.727 });
  });

  it("has no areas on a page without an image", () => {
    expect(tapAreas({ number: 1, dayLabel: null, type: "cover", image: null, questions: [] })).toEqual([]);
  });
});

describe("page QR codes", () => {
  it("opens the page of a shipped workbook for its own family", async () => {
    expect(await openPageToken(await family(), PARENT, token(FIRST, 3))).toEqual({ status: "found", childId: CHILD, workbookId: FIRST, page: 3 });
  });

  it("refuses a page of another family, of a workbook not shipped, or a token that is not there", async () => {
    const store = await family();
    expect(await openPageToken(store, OTHER_PARENT, token(FIRST, 3))).toEqual({ status: "refused" });
    expect(await openPageToken(store, PARENT, token(OTHER_BOOK, 2))).toEqual({ status: "refused" });
    expect(await openPageToken(store, PARENT, token(THIRD, 2))).toEqual({ status: "refused" });
    expect(await openPageToken(store, PARENT, "no-such-page-token-here")).toEqual({ status: "refused" });
  });
});

describe("the desk lock", () => {
  const lock = lockCookie(PARENT, CHILD);

  it("keeps the parent and the child in its cookie, and reads nothing else", () => {
    expect(readLock(lock)).toEqual({ parentId: PARENT, childId: CHILD });
    for (const bad of [undefined, "", "x.y", `${PARENT}.`, `${PARENT}.${CHILD}.more`, `${PARENT}`]) expect(readLock(bad), String(bad)).toBeNull();
  });

  it("sends every account page back to the desk while the desk is open", () => {
    for (const path of ["/account", "/account/pin", "/account/report/abc", "/admin", "/start", "/sign-in", "/sign-in/reset"]) {
      expect(deskGate(path, lock, PARENT), path).toBe("to-desk");
    }
    expect(DESK_HOME).toBe("/tutor");
  });

  it("refuses the account and admin APIs while the desk is open", () => {
    for (const path of ["/api/account/pin", "/api/account/card", "/api/admin/cards/1/start"]) expect(deskGate(path, lock, PARENT), path).toBe("refuse");
  });

  it("lets the desk, its own APIs and the sign-in callback through", () => {
    for (const path of ["/tutor", "/tutor/p/abc", "/tutor/forgot-pin", "/api/desk/leave", "/api/desk/forgot-pin", "/auth/callback"]) {
      expect(deskGate(path, lock, PARENT), path).toBe("pass");
    }
  });

  it("does nothing when no desk is open, nobody is signed in, or another parent is signed in", () => {
    expect(deskGate("/account", undefined, PARENT)).toBe("pass");
    expect(deskGate("/account", lock, null)).toBe("pass");
    expect(deskGate("/account", lock, OTHER_PARENT)).toBe("pass");
    expect(deskGate("/account", "not a lock", PARENT)).toBe("pass");
  });
});
