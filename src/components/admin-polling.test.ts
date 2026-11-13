// @vitest-environment happy-dom
import { act, createElement, Suspense, use, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "@/components/admin-shell";
import { RunRefresh } from "@/components/admin-run-refresh";

const refresh = vi.fn<() => void>();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }), usePathname: () => "/admin", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  default: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean; children: unknown }) =>
    createElement("a", { ...rest, href, "data-prefetch": String(prefetch) }, children as never),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("the admin sidebar", () => {
  const sidebar = () => renderToStaticMarkup(createElement(AdminShell, { email: "a@b.c", showTests: false, badges: Promise.resolve({}), pending: null }, createElement("main", null, "page")));

  it("loads no admin page before a click", () => {
    const links = sidebar().match(/<a [^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThan(10);
    expect(links.filter((l) => !l.includes('data-prefetch="false"'))).toEqual([]);
  });

  it("marks the page's own item, renders every folder open, and has the switch off by default", () => {
    const html = sidebar();
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/<a(?=[^>]*href="\/admin")(?=[^>]*aria-current="page")[^>]*>/);
    expect(html).not.toContain("is-shut");
    expect(html.match(/aria-expanded="true"/g)?.length).toBeGreaterThanOrEqual(6);
    expect(html).toMatch(/<input type="checkbox" role="switch"(?![^>]*checked)/);
    expect(html).toContain('action="/admin/parents"');
    for (const gone of ["Maya board", "Maya chat", "Cards and waitlist", "Scan pages", "Parent dashboard", ">Children<", ">Activity<"]) expect(html).not.toContain(gone);
  });
});

describe("the run page's refresh", () => {
  let root: Root;
  let host: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    refresh.mockReset();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  /** The page: each refresh renders new server data, which stays on its way until the test sends it. */
  async function page() {
    const answers: (() => void)[] = [];
    function Data({ data }: { data: Promise<void> }) {
      use(data);
      return null;
    }
    function Page() {
      const [data, setData] = useState(() => Promise.resolve());
      refresh.mockImplementation(() => setData(new Promise<void>((resolve) => answers.push(resolve))));
      return createElement(Suspense, { fallback: null }, createElement(Data, { data }), createElement(RunRefresh, {}));
    }
    await act(async () => root.render(createElement(Page)));
    return answers;
  }

  it("starts no new read while the last one is on its way", async () => {
    const answers = await page();
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTime(60_000));
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => answers[0]());
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
