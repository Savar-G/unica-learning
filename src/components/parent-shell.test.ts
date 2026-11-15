// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildView } from "@/lib/parent-view";

const address = vi.hoisted(() => ({ pathname: "/account", child: null as string | null }));
vi.mock("next/navigation", () => ({
  usePathname: () => address.pathname,
  useSearchParams: () => new URLSearchParams(address.child ? { child: address.child } : {}),
}));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: { children: unknown; href: string }) => createElement("a", { ...props, href }, children as never) }));
vi.mock("@/components/account", () => ({ SaveTimeZone: () => null }));

import { ParentShell } from "@/components/parent-shell";

const kid = (id: string): ChildView => ({
  id, firstName: id, schoolGrade: 3, stage: "first_book_coming", opensOn: "overview", tabs: ["overview", "assessment", "account"], readOnly: false,
  currentWorkbook: { number: 1 } as ChildView["currentWorkbook"], reportIds: [], finishedTests: [],
});
const kids = [kid("asha"), kid("omar")];

const shellProps = { remembered: "asha", pinSet: true, timeZoneSaved: true, children: null };
let root: Root, host: HTMLDivElement, savedCookies: string[];
const go = async (pathname: string, child: string | null = null) => {
  address.pathname = pathname;
  address.child = child;
  await act(async () => root.render(createElement(ParentShell, { ...shellProps, kids })));
};
const deskChild = () => host.querySelector<HTMLInputElement>('form[action="/api/desk/open"] input[name="child"]')?.value;
const shownName = () => host.querySelector(".pd-kid b")?.textContent;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  savedCookies = [];
  vi.spyOn(document, "cookie", "set").mockImplementation((value: string) => { savedCookies.push(value); });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("the frame keeps the child in view across pages", () => {
  it("stays on the child the parent selected when a page's address names no child", async () => {
    await go("/account");
    expect(shownName()).toBe("asha");
    await go("/account", "omar");
    expect(shownName()).toBe("omar");
    await go("/account/settings");
    expect(shownName()).toBe("omar");
    expect(deskChild()).toBe("omar");
    expect(savedCookies.at(-1)).toContain("omar");
  });
  it("opens on the remembered child at page load", async () => {
    await go("/account/settings");
    expect(shownName()).toBe("asha");
  });
});

describe("the cleaner frame (#1024)", () => {
  it("holds only the logo and the tabs in the sidebar; the desk and the child pill are in the header", async () => {
    await go("/account", "omar");
    const side = host.querySelector(".pd-side")!;
    expect(side.querySelector("form, .pd-kid, .pd-switch, .pd-desk")).toBeNull();
    expect(Array.from(side.querySelectorAll(".pd-nav a")).map(a => a.textContent)).toEqual(["Overview", "Assessment", "Account", "Feedback"]);
    const top = host.querySelector(".pd-top")!;
    expect(top.querySelector('form[action="/api/desk/open"] button')?.textContent).toContain("Open the desk");
    expect(top.querySelector(".pd-kid b")?.textContent).toBe("omar");
    expect(top.querySelector(".pd-top-name")?.textContent).toBe("omar");
    // One desk form and one pill in the whole frame, so nothing is sent twice.
    expect(host.querySelectorAll('form[action="/api/desk/open"]')).toHaveLength(1);
    expect(host.querySelectorAll(".pd-kid")).toHaveLength(1);
  });
  it("shows the child pill as a plain name for one child and as the switcher for several", async () => {
    await go("/account");
    expect(host.querySelector(".pd-top details.pd-switch")).not.toBeNull();
    expect(host.querySelector(".pd-top summary.pd-kid")?.getAttribute("aria-label")).toBe("asha. Change child");
    await act(async () => root.render(createElement(ParentShell, { ...shellProps, kids: [kid("asha")] })));
    expect(host.querySelector(".pd-top .pd-switch")).toBeNull();
    expect(host.querySelector(".pd-top div.pd-kid b")?.textContent).toBe("asha");
  });
  it("offers Set your PIN, not the desk form, until a PIN is set", async () => {
    await act(async () => root.render(createElement(ParentShell, { ...shellProps, pinSet: false, kids })));
    expect(host.querySelector('form[action="/api/desk/open"]')).toBeNull();
    expect(host.querySelector('.pd-top a.pd-desk[href="/account/pin?desk=1"]')?.textContent).toBe("Set your PIN");
  });
});

describe("one desk button, and no stylesheet that depends on :has() for it (#1024)", () => {
  it("marks the frame when the Overview holds the desk on its own name line, so the phone header leaves its own out", async () => {
    await go("/account", "omar");
    expect(host.querySelector(".pd-shell")?.classList.contains("pd-name-desk")).toBe(true);
    await go("/account/settings");
    expect(host.querySelector(".pd-shell")?.classList.contains("pd-name-desk")).toBe(false);
    // A child on the test page has no name line, so the header keeps its desk.
    address.pathname = "/account";
    address.child = null;
    await act(async () => root.render(createElement(ParentShell, { ...shellProps, kids: [{ ...kid("asha"), opensOn: "start_test" }] })));
    expect(host.querySelector(".pd-shell")?.classList.contains("pd-name-desk")).toBe(false);
    expect(host.querySelectorAll('form[action="/api/desk/open"]')).toHaveLength(1);
  });
  it("marks a header with no child, so it needs no :has() to hide", async () => {
    await act(async () => root.render(createElement(ParentShell, { ...shellProps, kids: [] })));
    expect(host.querySelector(".pd-top")?.classList.contains("pd-top-empty")).toBe(true);
    await go("/account");
    expect(host.querySelector(".pd-top")?.classList.contains("pd-top-empty")).toBe(false);
  });
});

/** The frame's stylesheet as rules: the whole selector list, its declarations and the @media condition around it (one level). */
function cssRules(css: string): { media: string | null; selector: string; body: string }[] {
  const out: { media: string | null; selector: string; body: string }[] = [];
  const read = (text: string, media: string | null) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) { depth += text[j] === "{" ? 1 : text[j] === "}" ? -1 : 0; j++; }
      const head = text.slice(i, open).trim();
      const inner = text.slice(open + 1, j - 1);
      if (head.startsWith("@media")) read(inner, head.slice(6).trim());
      else if (!head.startsWith("@")) out.push({ media, selector: head, body: inner });
      i = j;
    }
  };
  read(css.replace(/\/\*[\s\S]*?\*\//g, ""), null);
  return out;
}
const frameCss = cssRules(readFileSync("src/components/parent-shell.css", "utf8"));
const laptop = "(min-width: 900px)";
const phone = "(max-width: 899px)";
/** The declarations of every rule whose selector list matches, in file order. */
const declared = (selector: RegExp, media?: string | null) => frameCss.filter(r => selector.test(r.selector) && (media === undefined || r.media === media)).map(r => r.body);

describe("the frame's stylesheet (#1024)", () => {
  it("hides the phone's tab links on a laptop, where the sidebar holds those tabs", () => {
    expect(declared(/^\.pd-top-links$/, laptop).join(";")).toMatch(/display:\s*none/);
  });
  it("on a laptop, takes the Overview name row's desk out of the page (not focusable) and clips only its h1", () => {
    const desk = declared(/\.pd-name-row :is\(\.pd-desk-form, a\.pd-desk\)/, laptop);
    expect(desk).toHaveLength(1);
    expect(desk[0]).toMatch(/display:\s*none/);
    expect(declared(/\.pd-name-row h1$/, laptop).join(";")).toMatch(/clip:\s*rect\(0 0 0 0\)/);
    // The row itself is never clipped: that left the desk invisible but still focusable.
    expect(declared(/^\.pd-name-row$/).join(";")).not.toMatch(/clip:|position:\s*absolute/);
  });
  it("does not let the header's actions shrink, so a long name wraps instead of scrolling the page sideways", () => {
    expect(declared(/^\.pd-top-acts$/, null).join(";")).toMatch(/flex:\s*none/);
    expect(declared(/^\.pd-top-name$/).join(";")).toMatch(/min-width:\s*0[^]*overflow-wrap:\s*anywhere/);
  });
  it("hides the phone header's desk and the empty header with classes, not :has()", () => {
    expect(declared(/^\.pd-name-desk \.pd-top :is\(\.pd-desk-form, a\.pd-desk\)$/, phone).join(";")).toMatch(/display:\s*none/);
    expect(frameCss.filter(r => /\.pd-desk|\.pd-top|\.pd-name/.test(r.selector) && r.selector.includes(":has(")).map(r => r.selector)).toEqual([]);
  });
  it("keeps the goal card's light yellow and the phone note's tint out of the white-card restyle", () => {
    const white = frameCss.find(r => r.selector.includes(".rpt-call") && /background:\s*#fff/.test(r.body));
    expect(white?.selector).toContain(":not(.acct-goal, .acct-phone)");
    // Only the :not() names them: no rule here gives either card a background of its own.
    expect(frameCss.filter(r => /(?<!:not\()\.acct-goal|\.acct-phone/.test(r.selector.replace(/:not\([^)]*\)/g, "")) && /background/.test(r.body))).toEqual([]);
  });
  it("draws the desk button's outline in the darker grey", () => {
    expect(declared(/^\.pd-desk$/).join(";")).toMatch(/border:\s*1\.5px solid #b8b3aa/);
  });
});

it("keeps the selected child and stage links when Feedback opens, with a parent link on desktop and phone", async () => {
  await go("/account", "omar");
  const before = Array.from(host.querySelectorAll<HTMLAnchorElement>(".pd-bar a")).map(a => a.getAttribute("href"));
  await go("/account/feedback");
  expect(shownName()).toBe("omar");
  expect(deskChild()).toBe("omar");
  expect(Array.from(host.querySelectorAll<HTMLAnchorElement>(".pd-bar a")).map(a => a.getAttribute("href"))).toEqual(before);
  expect(host.querySelector('.pd-side a[href^="/account/feedback?"][aria-current="page"]')).not.toBeNull();
  expect(host.querySelector('.pd-top a[href^="/account/feedback?"][aria-current="page"]')).not.toBeNull();
});

it("keeps Schedule and the owned child in the address, switch links and cookie", async () => {
  kids.forEach(k => k.tabs.push("schedule"));
  try {
    await go("/account/schedule", "omar");
    expect(shownName()).toBe("omar");
    expect(savedCookies.at(-1)).toContain("omar");
    expect(host.querySelector('.pd-side a[href="/account/schedule?child=omar"][aria-current="page"]')).not.toBeNull();
    expect(host.querySelector('.pd-switch-list a[href="/account/schedule?child=asha"]')).not.toBeNull();
    await go("/account/schedule", "asha");
    expect(shownName()).toBe("asha");
    expect(host.querySelector('.pd-bar a[href="/account/schedule?child=asha"][aria-current="page"]')).not.toBeNull();
  } finally { kids.forEach(k => { k.tabs = k.tabs.filter(t => t !== "schedule"); }); }
});
