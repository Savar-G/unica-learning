// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountSignup, FinishAccount } from "@/components/account";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, replace: () => undefined, push: () => undefined }) }));
const events = vi.hoisted(() => vi.fn());
vi.mock("@/lib/track", () => ({ track: events, collectSource: () => ({}) }));

const fetched = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLElement;

async function show(element: ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(element));
}

const field = <T extends HTMLElement>(id: string) => host.querySelector<T>(`#${id}`)!;

/** Types into a controlled input the way React sees a person do it. */
async function type(id: string, value: string) {
  const input = field<HTMLInputElement>(id);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function choose(id: string, value: string) {
  const select = field<HTMLSelectElement>(id);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

const submit = () => act(async () => {
  host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
});

beforeEach(() => {
  fetched.mockClear();
  events.mockClear();
  vi.stubGlobal("fetch", fetched);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("the province on the signup form", () => {
  it.each([["laptop or tablet", false], ["phone", true]])("starts empty on a %s", async (_, phone) => {
    await show(createElement(AccountSignup, { phone }));
    const province = field<HTMLSelectElement>("a-c-province");
    expect(province.value).toBe("");
    expect(province.selectedOptions[0].textContent).toBe("Choose a province");
  });

  it("stops the signup until the parent chooses one", async () => {
    await show(createElement(AccountSignup, {}));
    await type("a-name", "Priya Shah");
    await type("a-email", "priya@family.ca");
    await type("a-telephone", "604 555 0123");
    await type("a-password", "a-long-password");
    await type("a-c-first", "Asha");
    await submit();
    expect(field("a-c-province").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement?.id).toBe("a-c-province");
    expect(fetched).not.toHaveBeenCalled();
  });
});

describe("the province on the finish form", () => {
  const finishForm = createElement(FinishAccount, { name: "Priya Shah", email: "priya@family.ca", needsPassword: false });

  it("starts empty", async () => {
    await show(finishForm);
    const province = field<HTMLSelectElement>("f-c-province");
    expect(province.value).toBe("");
    expect(province.selectedOptions[0].textContent).toBe("Choose a province");
  });

  it("sends nothing until the parent chooses one, then sends that province", async () => {
    await show(finishForm);
    await type("f-telephone", "604 555 0123");
    await type("f-c-first", "Asha");
    await submit();
    expect(field("f-c-province").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement?.id).toBe("f-c-province");
    expect(fetched).not.toHaveBeenCalled();

    await choose("f-c-province", "ON");
    await submit();
    expect(fetched).toHaveBeenCalledTimes(1);
    const [url, init] = fetched.mock.calls[0];
    expect(url).toBe("/api/account/finish");
    expect(JSON.parse(String(init?.body)).child).toMatchObject({ firstName: "Asha", province: "ON" });
    expect(JSON.parse(String(init?.body)).phone).toBe("604 555 0123");
    expect(String(url)).not.toContain("604");
    expect(JSON.stringify(events.mock.calls)).not.toContain("604 555 0123");
  });
});
