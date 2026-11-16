import { describe, expect, it } from "vitest";
import { replacementVerdict, scanPollDelay, scanWorkPending, spreadNote, addingCount, buildStack, dayPages, duplicateNote, refusalCopy, roomNote, sendLabel, stackSummary, waitingNote, type StackPhoto, type StackUpload } from "@/lib/scan-stack";

const BOOK = "book-1";
// Workbook 1: a cover, Day 4 with pages 10 to 13, Day 5 with pages 14 to 16.
const pages = dayPages([
  { id: "cover", workbookId: BOOK, book: 1, pageNumber: 1, day: null },
  ...[10, 11, 12, 13].map((n) => ({ id: `p${n}`, workbookId: BOOK, book: 1, pageNumber: n, day: "Day 4" })),
  ...[14, 15, 16].map((n) => ({ id: `p${n}`, workbookId: BOOK, book: 1, pageNumber: n, day: "Day 5" })),
]);

const photo = (id: string, pageNumber: number, o: Partial<StackPhoto> = {}): StackPhoto => ({
  id, pageId: `p${pageNumber}`, workbookId: BOOK, book: 1, pageNumber, state: "saved", check: "ready", reason: null, sentAt: null, createdAt: `2026-11-05T10:${String(pageNumber).padStart(2, "0")}:00Z`, ...o,
});

describe("dayPages", () => {
  it("numbers each page within its day, in book order, and leaves pages with no day out", () => {
    expect(pages.map((p) => [p.id, p.pageOfDay])).toEqual([["p10", 1], ["p11", 2], ["p12", 3], ["p13", 4], ["p14", 1], ["p15", 2], ["p16", 3]]);
    expect(pages[0]).toMatchObject({ day: "Day 4", pagesInDay: 4 });
  });
});

describe("buildStack", () => {
  it("groups pages by day in page order and names each page of the day with no photo yet", () => {
    const stack = buildStack({ photos: [photo("b", 12), photo("a", 10), photo("c", 15)], uploads: [], pages, checks: true });
    expect(stack.days.map((d) => d.label)).toEqual(["Day 4", "Day 5"]);
    expect(stack.days[0].tiles.map((t) => t.label)).toEqual(["Page 10", "Page 12"]);
    expect(stack.days[0].missing).toEqual([11, 13]);
    expect(stack.days[0].missingText).toBe("No photo yet: pages 11 and 13");
    expect(stack.days[1].missingText).toBe("No photo yet: pages 14 and 16");
  });

  it("puts refused pages first with their short reason, and a refused upload as an unknown page", () => {
    const uploads: StackUpload[] = [{ key: "u1", status: "refused", reason: "qr" }];
    const stack = buildStack({ photos: [photo("a", 10), photo("b", 12, { check: "refused", reason: "ambiguous-page" })], uploads, pages, checks: true });
    expect(stack.refused.map((t) => [t.label, t.reason])).toEqual([["Page 12 · Day 4", "More than one page"], ["Unknown page", null]]);
    expect(stack.days[0].tiles.map((t) => t.label)).toEqual(["Page 10"]);
    // A refused page still has a photo: it is not a gap.
    expect(stack.days[0].missing).toEqual([11, 13]);
  });

  it("counts only ready pages for Send, and leaves checking, refused and unchecked pages in the stack", () => {
    const stack = buildStack({
      photos: [
        photo("ready-1", 10), photo("ready-2", 11),
        photo("checking", 12, { check: "checking" }),
        photo("waiting-save", 13, { state: "pending", check: "ready" }),
        photo("refused", 14, { check: "refused", reason: "marks-missing" }),
        photo("old-book", 15, { check: "unavailable" }),
      ],
      uploads: [{ key: "u1", status: "uploading" }, { key: "u2", status: "waiting" }],
      pages, checks: true,
    });
    expect(stack.readyIds).toEqual(["ready-1", "ready-2"]);
    expect(stack.counts).toEqual({ photos: 8, ready: 2, refused: 1, checking: 4 });
    expect(stack.days[0].tiles.map((t) => t.status)).toEqual(["ready", "ready", "checking", "checking"]);
    expect(stack.days[1].tiles.map((t) => t.status)).toEqual(["unavailable"]);
    expect(stack.days[1].tiles[0].reason).toBe("Cannot be checked");
    expect(stack.adding).toBe(2);
    expect(sendLabel(stack.counts.ready)).toBe("Send 2 pages for marking");
    expect(waitingNote(stack)).toBe("4 pages are still being checked. They stay here.");
  });

  it("moves sent pages out of the days into their own group; they are neither ready nor gaps", () => {
    const stack = buildStack({ photos: [photo("a", 10), photo("s", 11, { sentAt: "2026-11-05T11:00:00Z" })], uploads: [], pages, checks: true });
    expect(stack.sent.map((t) => [t.label, t.status])).toEqual([["Page 11 · Day 4", "sent"]]);
    expect(stack.readyIds).toEqual(["a"]);
    expect(stack.days[0].missing).toEqual([12, 13]);
    // The count is this batch's: the sent page is not counted again.
    expect(stack.counts.photos).toBe(1);
  });

  it.each(["checking", "refused", "unavailable", "none"] as const)("an earlier Send does not hide a current %s check", (check) => {
    const stack = buildStack({ photos: [photo("old", 10, { sentAt: "2026-11-05T11:00:00Z", check, reason: check === "refused" ? "faint" : null })], uploads: [], pages, checks: true });
    expect(stack.sent).toEqual([]);
    expect(stack.readyIds).toEqual([]);
    if (check === "refused") {
      expect(stack.refused).toMatchObject([{ photoId: "old", refusal: "faint" }]);
      expect(stack.counts.refused).toBe(1);
    } else {
      expect(stack.days[0].tiles[0].status).toBe(check === "none" ? "saved" : check);
    }
  });

  it("keeps the Send history through rechecking, refusal and a new valid result", () => {
    const saved = photo("old", 10, { sentAt: "2026-11-05T11:00:00Z" });
    const show = (check: StackPhoto["check"]) => buildStack({ photos: [{ ...saved, check }], uploads: [], pages, checks: true });
    expect(show("checking").counts.checking).toBe(1);
    expect(show("refused").counts.refused).toBe(1);
    expect(show("ready").sent).toMatchObject([{ photoId: "old", status: "sent" }]);
    expect(show("ready").readyIds).toEqual([]);
    expect(saved.sentAt).toBe("2026-11-05T11:00:00Z");
  });

  it("a pending photo with a Send history still needs checking", () => {
    const stack = buildStack({ photos: [photo("old", 10, { sentAt: "2026-11-05T11:00:00Z", state: "pending" })], uploads: [], pages, checks: true });
    expect(stack.sent).toEqual([]);
    expect(stack.counts.checking).toBe(1);
  });

  it("without checks, a saved page is only saved: nothing is ready and nothing is checking", () => {
    const stack = buildStack({ photos: [photo("a", 10, { check: "none" }), photo("b", 11, { check: "none", state: "pending" })], uploads: [], pages, checks: false });
    expect(stack.days[0].tiles.map((t) => t.status)).toEqual(["saved", "checking"]);
    expect(stack.readyIds).toEqual([]);
    expect(stackSummary(stack, false)).toBe("2 photos saved.");
  });

  it("names the workbook in each day only when the stack holds pages of two workbooks", () => {
    const two = dayPages([...pages.map((p) => ({ ...p })), { id: "q3", workbookId: "book-2", book: 2, pageNumber: 3, day: "Day 1" }]);
    const stack = buildStack({ photos: [photo("a", 10), { ...photo("b", 3), pageId: "q3", workbookId: "book-2", book: 2 }], uploads: [], pages: two, checks: true });
    expect(stack.days.map((d) => d.label)).toEqual(["Workbook 1 · Day 4", "Workbook 2 · Day 1"]);
  });

  it("orders the one-page stack and says so in the Send button", () => {
    const stack = buildStack({ photos: [photo("a", 10)], uploads: [], pages, checks: true });
    expect(stack.one?.photoId).toBe("a");
    expect(sendLabel(1)).toBe("Send this page for marking");
    expect(sendLabel(0)).toBe("Send pages for marking");
  });
});

describe("words", () => {
  it("sums up the stack in plain words", () => {
    const stack = buildStack({ photos: [photo("a", 10), photo("b", 11, { check: "checking" })], uploads: [], pages, checks: true });
    expect(stackSummary(stack, true)).toBe("2 photos. 1 page is ready to send.");
    const none = buildStack({ photos: [photo("b", 11, { check: "checking" })], uploads: [], pages, checks: true });
    expect(stackSummary(none, true)).toBe("1 photo. No pages are ready to send yet.");
    // Photos already sent for marking are not counted again: only this batch (#915).
    const withSent = buildStack({ photos: [photo("old", 9, { sentAt: "2026-11-05T11:00:00Z" }), photo("a", 10)], uploads: [], pages, checks: true });
    expect(stackSummary(withSent, true)).toBe("1 photo. 1 page is ready to send.");
    expect(waitingNote(buildStack({ photos: [photo("a", 10)], uploads: [], pages, checks: true }))).toBeNull();
  });

  it("gives every refusal a short reason, a title and what to do, and fold-the-book-back for two sheets", () => {
    for (const reason of ["marks-missing", "marks-inconsistent", "page-mismatch", "orientation-unclear", "ambiguous-page", "qr-mismatch", "printed-page-changed", "failed", "qr", "page", "duplicate", "image", "size", "frequency", "quota", "unavailable"] as const) {
      const copy = refusalCopy(reason);
      // An unread code has no short reason: its tile says only "Unknown page" (2026-11-14).
      if (reason === "qr" || reason === "qr-mismatch") expect(copy.short).toBeNull(); else expect(copy.short?.length).toBeGreaterThan(0);
      expect(copy.title).toMatch(/\.$/);
      expect(copy.action).toMatch(/\.$/);
      expect(`${copy.short ?? ""} ${copy.title} ${copy.action}`).not.toMatch(/\b(she|her|AI|OpenRouter)\b/);
    }
    expect(refusalCopy("ambiguous-page").action).toContain("only one page shows");
    expect(refusalCopy("marks-missing").short).toBe("Hold closer");
  });
});

it("tells the parent what went wrong and the one thing to do, for each photo refusal (#915)", () => {
  // The code is named by where it is, with the one thing to do (2026-11-14).
  for (const reason of ["qr", "qr-mismatch"] as const) {
    const { short, title, action } = refusalCopy(reason);
    expect(`${title} ${action}`).toBe("We couldn't tell which page this is. Take the photo again with the whole page in view, including the small code in the bottom-left corner.");
    expect(short).toBeNull();
  }
  // The code was read but the page could not be lined up: the check cannot tell a cut-off edge from glare or a page too
  // small in the photo, so it says what fixes both, and never "cut off".
  // A hidden corner whose answers do not show this page's own frame: something lies on the page, so it says so (#977 review).
  expect(refusalCopy("corner-covered").title).toBe("Something covers a corner of the page.");
  for (const reason of ["marks-missing", "marks-inconsistent", "page-mismatch"] as const) {
    const { title, action } = refusalCopy(reason);
    expect(title).toBe("We could not line up this photo with the page.");
    expect(action).toBe("Hold the phone closer so the page fills the photo, and tilt it away from the light.");
  }
  for (const reason of ["marks-missing", "marks-inconsistent", "page-mismatch", "orientation-unclear", "ambiguous-page", "corner-covered", "qr-mismatch", "another-page", "faint", "check-timeout", "printed-page-changed", "failed", "qr", "page", "flat", "duplicate", "image", "size", "frequency", "quota", "unavailable"] as const) {
    expect(Object.values(refusalCopy(reason)).join(" ")).not.toMatch(/cut off|check the child|the stack/i);
  }
  expect(refusalCopy("faint").action).toContain("without the flash");
  // Every refusal ends with what to do, in one sentence the parent can act on.
  for (const reason of ["qr", "qr-mismatch", "marks-missing", "marks-inconsistent", "page-mismatch", "ambiguous-page", "faint", "failed"] as const)
    expect(refusalCopy(reason).action).toMatch(/\.$/);
});

it("keeps a duplicate out of the pages that need another photo, as information that names its page (#4)", () => {
  const uploads: StackUpload[] = [{ key: "d1", status: "refused", reason: "duplicate", page: 27, replaceable: "a" }, { key: "d2", status: "refused", reason: "duplicate" }];
  const stack = buildStack({ photos: [photo("a", 10)], uploads, pages, checks: true });
  expect(stack.refused).toEqual([]);
  expect(stack.counts).toMatchObject({ refused: 0, photos: 1 });
  expect(stack.duplicates.map(duplicateNote)).toEqual(["Page 27 is already scanned.", "This page is already scanned."]);
  expect(stack.duplicates.map((t) => t.replaceable ?? null)).toEqual(["a", null]);
});

describe("photos waiting to send (#915)", () => {
  const stackOf = (uploads: StackUpload[], ready = 0) => buildStack({ photos: Array.from({ length: ready }, (_, i) => photo(`r${i}`, 10 + i)), uploads, pages, checks: true });

  it("shows queued and held photos as waiting, and counts them beside the ones sending", () => {
    const stack = stackOf([{ key: "a", status: "uploading" }, { key: "b", status: "uploading", held: true }, { key: "c", status: "waiting" }]);
    // A new photo in progress names no reason (2026-11-14): a held one carries only the room hint for its sheet.
    expect(stack.addingTiles.map((t) => [t.status, t.reason, t.hint ?? null])).toEqual([["adding", null, null], ["waiting", null, "room"], ["waiting", null, null]]);
    expect([stack.adding, stack.waiting, stack.held]).toEqual([3, 2, 1]);
    expect(addingCount(stack)).toBe("Sending 1 photo, 2 waiting");
    expect(addingCount(stackOf([{ key: "a", status: "uploading" }, { key: "b", status: "uploading" }]))).toBe("Sending 2 photos");
    expect(addingCount(stackOf([{ key: "c", status: "waiting" }]))).toBe("1 photo waiting");
  });

  it("says nothing about room until a photo is held", () => {
    expect(roomNote(stackOf([{ key: "a", status: "uploading" }, { key: "c", status: "waiting" }], 2))).toBeNull();
  });

  it("asks the parent to send ready pages first when photos wait for room", () => {
    expect(roomNote(stackOf([{ key: "a", status: "uploading", held: true }, { key: "b", status: "waiting", held: true }], 2)))
      .toBe("There is no room for more photos yet. Send these pages for marking first, then add more. The waiting photos keep their place.");
  });

  it("with no ready page to send, says the photo goes on its own", () => {
    expect(roomNote(stackOf([{ key: "a", status: "uploading", held: true }])))
      .toBe("There is no room for more photos yet. The waiting photo keeps its place and goes when there is room.");
  });
});

it("names the sheet check's refusals in their own words (#456)", () => {
  // Disproved if a page refused for another page or for glare shows the "cannot line up" words of a failed check.
  expect(refusalCopy("another-page").title).toBe("Part of this photo looks like a different page.");
  expect(refusalCopy("faint").title).toBe("Part of the page is too bright, faint or covered to read.");
  expect(refusalCopy("faint").action).toBe("Use even light without the flash, and keep fingers and objects off the page. Then take another photo.");
  expect(refusalCopy("check-timeout").action).toBe("Try again in a minute.");
});

describe("the scan guide", () => {
  const named = dayPages([
    { id: "n1", workbookId: BOOK, book: 1, pageNumber: 1, day: "Day 1", type: "warm-up" },
    { id: "n2", workbookId: BOOK, book: 1, pageNumber: 2, day: "Day 1", type: "new-idea" },
    { id: "n3", workbookId: BOOK, book: 1, pageNumber: 3, day: "Day 1", type: "remember-these-mixed-set" },
    { id: "n4", workbookId: BOOK, book: 1, pageNumber: 4, day: "Day 1", type: "parent-led" },
    { id: "m1", workbookId: BOOK, book: 1, pageNumber: 5, day: "Day 2", type: "challenge" },
  ]);
  const shot = (n: number, o: Partial<StackPhoto> = {}) => ({ ...photo(`s${n}`, n, o), pageId: n === 5 ? "m1" : `n${n}` });

  it("names the next page by its kind and lists each page's standing", () => {
    const guide = buildStack({ photos: [shot(1), shot(2, { check: "refused", reason: "faint" })], uploads: [], pages: named, checks: true }).guide;
    expect(guide?.next?.title).toBe("Page 3 · Day 1, Mixed review");
    expect(guide?.pages.map((p) => [p.title, p.status])).toEqual([
      ["Page 1 · Day 1, Warm-up", "done"], ["Page 2 · Day 1, New idea", "retake"],
      ["Page 3 · Day 1, Mixed review", "todo"], ["Page 4 · Day 1", "todo"],
    ]);
  });

  it("has no next page when every page of the day has a photo, and no guide with no photo", () => {
    const all = buildStack({ photos: [1, 2, 3, 4].map((n) => shot(n)), uploads: [], pages: named, checks: true }).guide;
    expect(all?.next).toBeNull();
    expect(buildStack({ photos: [], uploads: [], pages: named, checks: true }).guide).toBeNull();
  });

  it("follows the newest photo's day, and ignores sent pages", () => {
    const later = shot(5, { createdAt: "2026-11-06T10:00:00Z" });
    expect(buildStack({ photos: [shot(1), later], uploads: [], pages: named, checks: true }).guide?.day).toBe("Day 2");
    expect(buildStack({ photos: [shot(1), { ...later, sentAt: "2026-11-06T11:00:00Z" }], uploads: [], pages: named, checks: true }).guide?.day).toBe("Day 1");
  });

  it("names the workbook when the stack spans more than one", () => {
    const two = dayPages([{ id: "a", workbookId: "b1", book: 1, pageNumber: 1, day: "Day 1" }, { id: "b", workbookId: "b2", book: 2, pageNumber: 1, day: "Day 1" }]);
    const g = buildStack({ photos: [{ ...photo("x", 1), pageId: "a", workbookId: "b1" }, { ...photo("y", 1), pageId: "b", workbookId: "b2", book: 2 }], uploads: [], pages: two, checks: true }).guide;
    expect(g?.pages[0].title).toBe("Page 1 · Workbook 1 · Day 1");
  });

  const day1 = named.filter((p) => p.day === "Day 1");
  const withDay2 = [...named, { ...named[4], id: "m2", pageNumber: 6, pageOfDay: 2, pagesInDay: 2, name: "Practice" }];

  it("counts the pages left in this day only, a page needing another photo included", () => {
    const guide = buildStack({ photos: [shot(1), shot(2, { check: "refused", reason: "faint" })], uploads: [], pages: day1, checks: true }).guide;
    expect(guide?.stillText).toBe("3 pages left in Day 1.");
    expect(buildStack({ photos: [1, 2, 3, 4, 5].map((n) => shot(n)), uploads: [], pages: withDay2, checks: true }).guide?.stillText).toBe("1 page left in Day 2.");
  });

  it("never lists an earlier day the parent did not finish (#915)", () => {
    // Day 1 has one photo; the parent is now scanning Day 2: only Day 2's pages are counted.
    const later = { ...shot(5), createdAt: "2026-11-06T12:00:00Z" };
    const guide = buildStack({ photos: [shot(2), later], uploads: [], pages: withDay2, checks: true }).guide;
    expect(guide?.day).toBe("Day 2");
    expect(guide?.stillText).toBe("1 page left in Day 2.");
    expect(guide?.pages.map((p) => p.title)).toEqual(["Page 5 · Day 2, Challenge", "Page 6 · Day 2, Practice"]);
  });

  it("keeps the latest day when an earlier page is retaken afterwards (#915 review)", () => {
    // Day 2 photographed first, then a Day 1 page added later: the guide stays on Day 2.
    const day2 = { ...shot(5), createdAt: "2026-11-06T09:00:00Z" };
    const retake = { ...shot(2), createdAt: "2026-11-06T12:00:00Z" };
    expect(buildStack({ photos: [day2, retake], uploads: [], pages: withDay2, checks: true }).guide?.day).toBe("Day 2");
  });

  it("says all pages are scanned when none are left", () => {
    expect(buildStack({ photos: [1, 2, 3, 4].map((n) => shot(n)), uploads: [], pages: named.filter((p) => p.day === "Day 1"), checks: true }).guide?.stillText).toBe("All pages of Day 1 are scanned.");
  });
});

describe("two-page photos (#965)", () => {
  it("names the second pages the server could not keep, and asks for a photo of each alone", () => {
    expect(spreadNote([])).toBeNull();
    expect(spreadNote([24])).toBe("Page 24 was in a photo of two pages, but we could not keep it. Take a photo of that page on its own.");
    expect(spreadNote([24, 26])).toBe("Pages 24 and 26 were in a photo of two pages, but we could not keep them. Take a photo of each on its own.");
  });
  it("tells the parent to lay the book flat when the pages are not flat", () => {
    expect(refusalCopy("flat")).toMatchObject({ short: "Pages not flat", title: "The pages are not flat in this photo." });
  });
});

describe("offline uploads (F3)", () => {
  const failed: StackUpload = { key: "local:1", status: "refused", reason: "unavailable" };
  it("shows a photo that failed only for the connection with the new photos, waiting for the connection, while offline", () => {
    const stack = buildStack({ photos: [], uploads: [failed, { key: "local:2", status: "refused", reason: "qr" }], pages, checks: true, offline: true });
    expect(stack.refused.map((t) => t.key)).toEqual(["local:2"]);
    expect(stack.addingTiles).toEqual([expect.objectContaining({ key: "local:1", status: "waiting", reason: "Waiting for connection", hint: "offline", refusal: null })]);
  });
  it("keeps a failed photo as one to try again once the phone is online", () => {
    const stack = buildStack({ photos: [], uploads: [failed], pages, checks: true });
    expect(stack.refused.map((t) => [t.key, t.reason])).toEqual([["local:1", "Not sent"]]);
    expect(stack.addingTiles).toEqual([]);
  });
});

describe("retake hand-off", () => {
  const target = { photoId: "old", pageId: "p11", workbookId: BOOK, pageNumber: 11, day: "Day 4" };
  const upload: StackUpload = { key: "local:retake", status: "waiting", target };
  const show = (uploads: StackUpload[], photos: StackPhoto[]) => buildStack({ uploads, photos, pages, checks: true });
  it("keeps the target identity, hides the old refusal and keeps one tile through upload and listing", () => {
    const old = photo("old", 11, { check: "refused", reason: "marks-missing" });
    for (const photos of [[old], [], [photo("new", 11, { check: "checking" })]]) {
      const stack = show([{ ...upload, status: "uploaded", uploadedId: "new" }], photos);
      expect(stack.refused).toEqual([]);
      expect(stack.counts).toMatchObject({ photos: 1, checking: 1 });
      expect(stack.addingTiles).toMatchObject([{ label: "Page 11", title: "Page 11 · Day 4", status: "checking", reason: "Checking page 11…", pageId: "p11", retake: true }]);
    }
  });
  it("uses the real page identity after the verdict, even if it is a different page", () => {
    const stack = show([{ ...upload, status: "uploaded", uploadedId: "new" }], [photo("new", 12)]);
    expect(stack.addingTiles).toEqual([]);
    expect(stack.days[0].tiles).toMatchObject([{ photoId: "new", label: "Page 12", status: "ready" }]);
    expect(stack.days[0].missing).toContain(11);
  });
  it("keeps upload and check failures explicit on the intended page", () => {
    expect(show([{ ...upload, status: "refused", reason: "unavailable" }], []).refused).toMatchObject([{ title: "Page 11 · Day 4", refusal: "unavailable", status: "refused" }]);
    expect(show([{ ...upload, status: "uploaded", uploadedId: "new" }], [photo("new", 11, { check: "checking", checkFailed: true })]).refused).toMatchObject([{ title: "Page 11 · Day 4", photoId: "new", refusal: "check-timeout" }]);
  });
  it("keeps checking until the blur check finishes too", () => {
    const stack = show([{ ...upload, status: "uploaded", uploadedId: "new" }], [photo("new", 11, { photoCheck: { state: "pending" } })]);
    expect(stack.addingTiles[0].status).toBe("checking");
    expect(stack.readyIds).toEqual([]);
  });
});


describe("scan polling", () => {
  const pending = (photos: StackPhoto[], uploads: StackUpload[] = [], marking = true) => scanWorkPending({ photos, uploads, checks: true, marking });
  it("polls for local work, placement, blur checks and automatic marks", () => {
    expect(pending([], [{ key: "u", status: "waiting" }])).toBe(true);
    expect(pending([], [{ key: "u", status: "uploaded", uploadedId: "new" }])).toBe(true);
    expect(pending([photo("p", 11, { state: "pending" })])).toBe(true);
    expect(pending([photo("p", 11, { check: "checking" })])).toBe(true);
    expect(pending([photo("p", 11, { photoCheck: { state: "pending" } })])).toBe(true);
    expect(pending([photo("p", 11, { sentAt: "2026-11-15T12:00:00Z", marks: null })])).toBe(true);
    expect(pending([photo("p", 11, { sentAt: "2026-11-15T12:00:00Z", marks: { right: 1, scored: 1, total: 2, waiting: 1, toPractise: 0, complete: false, automaticPending: 1 } })])).toBe(true);
  });
  it("refreshes team-only waits, stopping only for terminal marks and failed checks", () => {
    const marks = { right: 1, scored: 1, total: 2, waiting: 1, toPractise: 0, complete: false, automaticPending: 0 };
    expect(pending([photo("p", 11, { sentAt: "2026-11-15T12:00:00Z", marks })])).toBe(true);
    for (const result of [{ ...marks, complete: true }, { ...marks, unfinished: true }]) expect(pending([photo("p", 11, { sentAt: "2026-11-15T12:00:00Z", marks: result })])).toBe(false);
    expect(pending([photo("p", 11, { check: "checking", checkFailed: true })])).toBe(false);
    expect(pending([], [{ key: "u", status: "refused", reason: "unavailable" }])).toBe(false);
    expect(pending([photo("p", 11, { sentAt: "2026-11-15T12:00:00Z" })], [], false)).toBe(false);
  });
});

it.each([null, "blurry"] as const)("waits across unclaimed and pending blur checks until the %s verdict", (problem) => {
  const upload: StackUpload = { key: "new", status: "uploaded", uploadedId: "new", target: { photoId: "old", pageId: "p11", workbookId: BOOK, pageNumber: 11, day: "Day 4" } };
  const replacement = photo("new", 11, { check: "ready", photoCheckRequired: true, photoCheck: null });
  for (const photoCheck of [null, { state: "pending" as const }]) {
    replacement.photoCheck = photoCheck;
    expect(replacementVerdict(upload, [replacement], true)).toBeNull();
    expect(buildStack({ photos: [replacement], uploads: [upload], pages, checks: true }).addingTiles[0].status).toBe("checking");
  }
  replacement.photoCheck = { state: "done", problem };
  expect(replacementVerdict(upload, [replacement], true)).toBe(replacement);
  replacement.photoCheck = null; replacement.photoCheckRequired = false;
  expect(replacementVerdict(upload, [replacement], true)).toBe(replacement);
});

it("backs off unchanged automatic work after ten seconds and caps both polling lanes", () => {
  expect([0, 9999, 10_000, 20_000, 30_000, 40_000, 3600_000].map((ms) => scanPollDelay(ms, true))).toEqual([2000, 2000, 5000, 10_000, 20_000, 30_000, 30_000]);
  expect(scanPollDelay(0, false)).toBe(30_000);
});

it("names a duplicate retake by the server's page number, without assigning its verdict to the intended page", () => {
  const stack = buildStack({ photos: [photo("kept", 12)], pages, checks: true, uploads: [{ key: "local:retake", status: "refused", reason: "duplicate", page: 12, target: { photoId: "old", pageId: "p11", workbookId: BOOK, pageNumber: 11, day: "Day 4" } }] });
  expect(stack.duplicates).toMatchObject([{ label: "Page 12" }]);
  expect(stack.refused).toEqual([]);
  expect(stack.days[0].missing).toContain(11);
});
