import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ParentSchedule } from "./parent-schedule";

it("shows the approved five-day guidance above the printed schedule", () => {
  const html = renderToStaticMarkup(createElement(ParentSchedule, { schedule: {
    kind: "ready", child: { id: "child", parentId: "parent", firstName: "Alex" },
    book: { id: "book", number: 1 }, rows: [], dailyTime: "20 minutes",
  } }));
  const text = html.replace(/&#x27;/g, "'");
  const first = "5 days on, 2 days off. The workbook has 10 days, so it takes 2 weeks. Do one day on 5 days of each week, for example Monday to Friday, with the weekend off. The days off give your child time to rest, or to look back at the week's pages, and come back ready to learn. A steady 5 days a week builds a habit. Working every single day can wear kids out and make math feel like a chore, for your child and for you.";
  const second = "You choose the 5 days. For example: Monday, Tuesday, Thursday, Friday and Saturday, with Wednesday and Sunday off. Just do the days in order, Day 1 to Day 10, and keep to the same 5 days each week.";
  expect(text).toContain(`>${first}</p>`);
  expect(text).toContain(`>${second}</p>`);
  expect(text.indexOf(first)).toBeLessThan(text.indexOf(second));
  expect(text.indexOf(second)).toBeLessThan(text.indexOf("<table"));
});

it("shows scanned pages and marks as two columns and names the days with pages still to scan (#475)", () => {
  const row = (day: number, scan: unknown, marks: unknown) => ({ day, topic: "Addition", second: "Facts", pages: [3, 10] as [number, number], requiredMinutes: 20, extra: false, scan, marks });
  const html = renderToStaticMarkup(createElement(ParentSchedule, { schedule: {
    kind: "ready", child: { id: "child", parentId: "parent", firstName: "Alex" }, book: { id: "book", number: 1 }, dailyTime: "20 minutes",
    rows: [
      row(1, { kind: "known", accepted: 8, required: 8, missing: [] }, { kind: "all", marked: 8, total: 8 }),
      row(2, { kind: "known", accepted: 6, required: 8, missing: [14, 17] }, { kind: "checking", marked: 5, total: 8 }),
      row(3, { kind: "known", accepted: 7, required: 8, missing: [22] }, { kind: "some", marked: 2, total: 8 }),
      row(4, { kind: "unknown" }, { kind: "none", marked: 0, total: 8 }),
      row(5, { kind: "unknown" }, { kind: "unknown" }),
    ],
  } as never }));
  const cells = [...html.matchAll(/<td data-label="(Scanned|Marks)">(.*?)<\/td>/g)].map(m => [m[1], m[2].replace(/<[^>]+>/g, "|")]);
  expect(cells).toEqual([
    ["Scanned", "8 of 8 scanned"], ["Marks", "All marked"],
    ["Scanned", "6 of 8 scanned|Still to scan: pages 14 and 17|"], ["Marks", "Our team is checking some answers|5 of 8 pages marked|"],
    ["Scanned", "7 of 8 scanned|Still to scan: page 22|"], ["Marks", "2 of 8 pages marked"],
    ["Scanned", "Scan status unavailable"], ["Marks", "Not marked yet"],
    ["Scanned", "Scan status unavailable"], ["Marks", "Mark status unavailable"],
  ]);
  expect(html).toContain("Pages still to scan: Day 2 and Day 3.");
  expect((html.match(/class="ps-gap-row"/g) ?? []).length).toBe(2);
});
