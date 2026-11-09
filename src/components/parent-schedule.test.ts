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
