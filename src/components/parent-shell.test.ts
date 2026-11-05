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
vi.mock("next/link", () => ({ default: ({ children, href }: { children: unknown; href: string }) => createElement("a", { href }, children as never) }));
vi.mock("@/components/account", () => ({ SaveTimeZone: () => null }));

import { ParentShell } from "@/components/parent-shell";

const kid = (id: string): ChildView => ({
  id, firstName: id, schoolGrade: 3, stage: "first_book_coming", opensOn: "overview", tabs: ["overview", "assessment", "account"], readOnly: false,
  currentWorkbook: { number: 1 } as ChildView["currentWorkbook"], reportIds: [],
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
