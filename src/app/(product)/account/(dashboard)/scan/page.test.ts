import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import ScanPage from "./page";

vi.mock("server-only", () => ({}));

const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const TABLET = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
// iPadOS Safari asks for the desktop site by default, so the server sees a Mac.
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";

const BOOK = "6f1c2a3b-0000-4000-8000-000000000001";
const state = vi.hoisted(() => ({
  signedIn: true as boolean,
  released: true as boolean,
  ua: "",
  remembered: null as string | null,
  dashboard: true,
  qr: [] as string[],
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": state.ua, host: "localhost:3000" }) }));
vi.mock("qrcode", () => ({ default: { toString: async (text: string) => { state.qr.push(text); return "<svg>qr</svg>"; } } }));
vi.mock("@/lib/supabase-auth", () => ({ parentId: async () => (state.signedIn ? "p1" : null), sessionClient: async () => ({}) }));
vi.mock("@/lib/parent-dashboard-server", () => ({
  parentDashboard: async () => (state.dashboard ? { children: [], remembered: state.remembered, pinSet: true, timeZoneSaved: true } : null),
}));
vi.mock("@/lib/scan-photo-server", () => ({
  scanSession: async () => {
    if (!state.released) throw new Error("NOT_FOUND");
    const result = (data: unknown) => ({ data, error: null });
    const kids = [{ id: "c1", first_name: "Iris" }, { id: "c2", first_name: "Leo" }];
    return {
      parent: "p1",
      db: {
        from: (table: string) => ({
          select: () => ({
            eq: () => {
              // A page's QR code names workbook 1 of Leo (c2): Day 4 is pages 10 to 13.
              if (table === "workbook_pages") return Promise.resolve(result([10, 11, 12, 13, 14].map((n) => ({ id: `p${n}`, page_number: n, day_label: n < 14 ? "Day 4" : "Day 5" }))));
              return {
                order: async () => result(kids),
                maybeSingle: async () => result(table === "workbooks" ? { id: BOOK, child_id: "c2", number: 1, status: "shipped" } : null),
              };
            },
          }),
        }),
      },
    };
  },
}));
vi.mock("@/components/scan-pages", () => ({
  ScanPages: ({ childrenList, mode = "phone", focus }: { childrenList: { first_name: string }[]; mode?: string; focus?: { label: string } | null }) =>
    createElement("p", null, `${mode === "desktop" ? "pages from the phone" : "camera flow"}: ${childrenList.map((c) => c.first_name).join(", ")}${focus ? ` · ${focus.label}` : ""}`),
}));

const render = async (query: Record<string, string> = {}) =>
  renderToStaticMarkup((await ScanPage({ searchParams: Promise.resolve(query), params: Promise.resolve({}) } as never)) as ReactElement);

beforeEach(() => {
  Object.assign(state, { signedIn: true, released: true, ua: PHONE, remembered: null, dashboard: true, qr: [] });
});

it("opens the camera flow on a phone and on a tablet", async () => {
  expect(await render()).toContain("camera flow: Iris, Leo");
  state.ua = TABLET;
  expect(await render()).toContain("camera flow: Iris, Leo");
  expect(state.qr).toEqual([]);
});

it("opens the camera flow on the child in view in the dashboard", async () => {
  state.remembered = "c2";
  expect(await render()).toContain("camera flow: Leo, Iris");
});

it("asks a desktop for a phone, with a QR code of the page's address only and the email button", async () => {
  state.ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  state.remembered = "c2";
  const out = await render();
  expect(out).toContain("Please take a picture with your phone");
  expect(out).not.toContain("camera flow");
  // D-273: the pages from the phone, live, beside the code, on the child in view.
  expect(out).toContain("pages from the phone: Leo, Iris");
  expect(state.qr).toEqual(["http://localhost:3000/account/scan"]);
  expect(out).toContain("<svg>qr</svg>");
  expect(out).toContain("Email me the link");
  expect(out).toContain("Leo&#x27;s finished pages");
  expect(out).not.toMatch(/\b(she|her)\b/i);
});

it("offers an iPad that reports a Mac the desktop screen, with a way to continue on it", async () => {
  state.ua = IPAD_AS_MAC;
  const out = await render();
  expect(out).toContain("Please take a picture with your phone");
  expect(out).toContain('href="/account/scan?here=1"');
  expect(await render({ here: "1" })).toContain("camera flow");
});

it("keeps the back link only outside the dashboard frame", async () => {
  expect(await render()).not.toContain("Back to your account");
  state.dashboard = false;
  expect(await render()).toContain("Back to your account");
});

it("sends a signed-out visitor to sign in and back", async () => {
  state.signedIn = false;
  await expect(render()).rejects.toThrow("REDIRECT /sign-in?next=%2Faccount%2Fscan");
});

it("keeps the scan gate: a family scanning is not released to gets the 404 on every device", async () => {
  state.released = false;
  await expect(render()).rejects.toThrow("NOT_FOUND");
  state.ua = IPAD_AS_MAC;
  await expect(render()).rejects.toThrow("NOT_FOUND");
  expect(state.qr).toEqual([]);
});

it("opens Scan pages on the page a QR code named, for that page's child", async () => {
  expect(await render({ w: BOOK, p: "12" })).toContain("camera flow: Leo, Iris · Day 4 · Page 3");
  // Anything that is not a workbook id and a page number names no page.
  expect(await render({ w: "not-an-id", p: "12" })).toContain("camera flow: Iris, Leo<");
});

it("keeps the page a QR code named when an iPad that reports a Mac continues on this device, whoever was remembered", async () => {
  state.ua = IPAD_AS_MAC;
  state.remembered = "c1";
  const out = await render({ w: BOOK, p: "12" });
  const href = /href="([^"]*here=1[^"]*)"/.exec(out)![1].replaceAll("&amp;", "&");
  const query = Object.fromEntries(new URL(href, "http://localhost:3000").searchParams);
  expect(query).toEqual({ w: BOOK, p: "12", here: "1" });
  expect(await render(query)).toContain("camera flow: Leo, Iris · Day 4 · Page 3");
});

it("carries no page on Take the pictures on this device when the address names none", async () => {
  state.ua = IPAD_AS_MAC;
  expect(await render({ w: "not-an-id", p: "12" })).toContain('href="/account/scan?here=1"');
});

