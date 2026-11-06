// @vitest-environment happy-dom
import { act, createElement, Suspense, use, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminFrame } from "@/components/admin";
import { RunRefresh } from "@/components/admin-run-refresh";

const refresh = vi.fn<() => void>();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }), usePathname: () => "/admin", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  default: ({ href, prefetch, children }: { href: string; prefetch?: boolean; children: unknown }) =>
    createElement("a", { href, "data-prefetch": String(prefetch) }, children as never),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("the admin bar", () => {
  it("loads no admin page before a click", () => {
    const html = renderToStaticMarkup(createElement(AdminFrame, { email: "a@b.c", section: "workbooks", title: "T" } as Parameters<typeof AdminFrame>[0], null));
    const links = html.match(/<a [^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThan(10);
    expect(links.filter((l) => !l.includes('data-prefetch="false"'))).toEqual([]);
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
