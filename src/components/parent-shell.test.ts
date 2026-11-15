// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
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
