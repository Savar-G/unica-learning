// @vitest-environment happy-dom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScanPageResults } from "./scan-page-results";
import type { ResultsQuestion, ScanResultsPageData } from "@/lib/scan-page-results";

const auth = vi.hoisted(() => ({ callbacks: [] as ((event: string, session: { user: { id: string } } | null) => void)[] }));
vi.mock("@/lib/supabase-browser", () => ({ browserClient: () => ({ auth: { onAuthStateChange(callback: typeof auth.callbacks[number]) { auth.callbacks.push(callback); return { data: { subscription: { unsubscribe() {} } } }; } } }) }));
vi.mock("next/image", () => ({ default: ({ unoptimized, ...props }: { unoptimized?: boolean }) => { void unoptimized; return createElement("img", props); } }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: string }) => createElement("a", { href }, children) }));

const question: ResultsQuestion = { itemId: "seven", number: 7, version: 2, kind: "review", readAnswer: "8", correctAnswer: "9", questionText: "17 − 8", explainable: true, evidencePhoto: "photo", regions: [{ x: .7, y: .4, width: .1, height: .05 }], questionBox: { x: .1, y: .35, width: .75, height: .15 } };
const data: ScanResultsPageData = { child: "Leah", day: "Day 9", page: 67, photo: { src: "/synthetic.jpg", width: 1000, height: 2000, aligned: true }, budgetHeld: false, unfinished: false,
  questions: [question, { ...question, number: 14, itemId: "fourteen", questionText: "18 − 9", regions: [{ x: .7, y: .8, width: .1, height: .05 }] }, { ...question, number: 1, itemId: "right", kind: "right" }] };
const ready = { status: "ready", correctAnswer: "9", explanation: { steps: ["Start at 17.", "Take away 8.", "There are 9 left."], say: "How many are left?" } };
let host: HTMLDivElement, root: Root;
const requests = () => vi.mocked(fetch);
const button = (label: string) => [...host.querySelectorAll("button")].find(button => button.textContent?.trim() === label)!;
const click = async (label: string) => { expect(button(label), label).toBeDefined(); await act(async () => button(label).click()); };
const show = async (page = data, strict = false) => { await act(async () => root.render(createElement(strict ? StrictMode : "div", null, createElement(ScanPageResults, { data: page, photo: "photo", parent: "parent" })))); };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); auth.callbacks = [];
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(ready)));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("renders only the own-photo overview, frozen markers, green ticks and one main action; no explanations load", async () => {
  await show();
  expect(host.querySelector("h1")?.textContent).toBe("Page results");
  expect(host.textContent).toContain("Leah · Day 9 · Page 67"); expect(host.textContent).toContain("1 of 3 right");
  expect(host.textContent).toContain("2 to go over: questions 7 and 14");
  expect(host.querySelectorAll(".spr-primary")).toHaveLength(1);
  expect(host.querySelector("img")?.alt).toContain("Leah's photographed page");
  const marker = host.querySelector<HTMLButtonElement>('[aria-label="Go through question 7 together"]')!;
  expect(parseFloat(marker.style.left)).toBeCloseTo(75); expect(parseFloat(marker.style.top)).toBeCloseTo(42.5);
  expect(host.querySelector('[aria-label="Question 1 right"]')).not.toBeNull();
  expect(host.querySelector(".spr-steps")).toBeNull(); expect(requests()).not.toHaveBeenCalled();
  await act(async () => marker.click());
  expect(host.querySelector("h1")?.textContent).toBe("Go through it together");
  expect(JSON.parse(requests().mock.calls[0][1]!.body as string)).toEqual({ itemId: "seven", version: 2 });
});
it("opens at the selected marker and keeps Previous and Finish available before revealing a step", async () => {
  await show();
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Go through question 14 together"]')!.click());
  expect(host.textContent).toContain("2 of 2"); expect(button("‹ Previous").disabled).toBe(false); expect(button("Finish").disabled).toBe(false);
  expect(host.querySelectorAll(".spr-steps li")).toHaveLength(0);
  await click("Finish"); expect(host.querySelector("h1")?.textContent).toBe("All done");
  await click("Back to page results"); expect(host.querySelector("h1")?.textContent).toBe("Page results");
});
it("reveals steps then Say, preserves per-question progress and mode changes do not destroy progress", async () => {
  await show(); await click("Go through it together →");
  expect(button("‹ Previous").disabled).toBe(true); expect(button("Next question ›").disabled).toBe(false);
  expect(host.textContent).toContain("Leah wrote 8 · Answer 9");
  await click("Show next step"); expect(host.querySelectorAll(".spr-steps li")).toHaveLength(1); expect(host.textContent).not.toContain("Say to Leah");
  await click("Next question ›"); await click("Show next step"); await click("Show next step");
  await click("‹ Previous"); expect(host.querySelectorAll(".spr-steps li")).toHaveLength(1);
  await click("Show all"); expect(host.querySelectorAll(".spr-steps li")).toHaveLength(3); expect(host.textContent).toContain("Say to Leah");
  await click("Step by step"); expect(host.querySelectorAll(".spr-steps li")).toHaveLength(1);
  await click("Show next step"); await click("Show next step"); expect(host.textContent).toContain("Say to Leah");
  await click("Next question ›"); expect(host.querySelectorAll(".spr-steps li")).toHaveLength(2);
  expect(requests()).toHaveBeenCalledTimes(2);
});
it("toggles the whole page while retaining an outline and the revealed steps", async () => {
  await show(); await click("Go through it together →"); await click("Show next step");
  expect(host.querySelector(".spr-photo-crop")).not.toBeNull();
  await click("See whole page"); expect(host.querySelector(".spr-photo-crop")).toBeNull(); expect(host.querySelector(".spr-outline")).not.toBeNull();
  await click("Zoom to question"); expect(host.querySelectorAll(".spr-steps li")).toHaveLength(1);
});
it("unsupported explanations show a stored question and key with no dead control or API request", async () => {
  await show({ ...data, questions: [{ ...question, explainable: false }] }); await click("Go through it together →");
  expect(host.textContent).toContain("17 − 8"); expect(host.textContent).toContain("Answer 9"); expect(host.textContent).toContain("An explanation is not available");
  expect(host.querySelector('[aria-label="Explanation mode"]')).toBeNull(); expect(button("Show next step")).toBeUndefined();
  expect(requests()).not.toHaveBeenCalled(); expect(button("Finish").disabled).toBe(false);
});
it("team-checking answers are not wrong, numbered review markers, scores, keys or explanation requests", async () => {
  await show({ ...data, questions: [{ ...question, kind: "team", questionText: null, correctAnswer: null, explainable: false, readAnswer: null }] });
  expect(host.textContent).toContain("Our team is checking this one"); expect(host.textContent).not.toMatch(/Wrong|Answer 9/); expect(host.querySelector(".spr-score")).toBeNull();
  expect(host.querySelector(".spr-marker")).toBeNull(); expect(host.querySelector(".spr-primary")).toBeNull(); expect(requests()).not.toHaveBeenCalled();
});
it("missing photo/contracts never invent markers or a crop but navigation remains available", async () => {
  await show({ ...data, photo: null, questions: [{ ...question, explainable: false, regions: [], questionBox: null }] });
  expect(host.textContent).toContain("Photo no longer available"); await click("Go through it together →");
  expect(host.querySelector(".spr-outline")).toBeNull(); expect(button("See whole page")).toBeUndefined(); expect(button("Finish")).toBeDefined();
});
it("an unaligned original photo has no coordinates even if a caller passes old regions", async () => {
  await show({ ...data, photo: { ...data.photo!, aligned: false } });
  expect(host.querySelector(".spr-marker")).toBeNull(); expect(host.querySelector(".spr-tick")).toBeNull();
  await click("Go through it together →"); expect(host.querySelector(".spr-outline")).toBeNull(); expect(host.querySelector(".spr-photo-crop")).toBeNull();
  expect(button("See whole page")).toBeUndefined();
});
it("an expired image response removes all overlays rather than leaving markers on an empty frame", async () => {
  await show(); await act(async () => host.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(host.textContent).toContain("Photo no longer available"); expect(host.querySelector(".spr-marker")).toBeNull();
});
it.each(["busy", "retry", "cap", "unavailable", "plan_closed", "refused"])("%s is announced once and never polls or retries on navigation", async status => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status }, { status: status === "plan_closed" ? 403 : status === "refused" ? 409 : 200 })));
  await show(); await click("Go through it together →");
  expect(host.querySelector(".spr-notice")?.textContent).toMatch(/being prepared|could not prepare|more explanations|not available|mark changed/i);
  await click("Show all"); await click("Step by step"); await click("‹ Back to page results"); await click("Go through it together →");
  expect(requests()).toHaveBeenCalledTimes(1); expect(button("Next question ›").disabled).toBe(false);
  if (status === "busy" || status === "retry") { await click("Try explanation again"); expect(requests()).toHaveBeenCalledTimes(2); }
  if (status === "refused") expect(host.textContent).not.toContain("Answer 9");
});
it("network/invalid output errors are retryable and never replace the stored answer", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(Response.json({ ...ready, correctAnswer: "999" })));
  await show(); await click("Go through it together →"); expect(host.textContent).toContain("could not prepare");
  await click("Try explanation again"); expect(host.textContent).not.toContain("999"); expect(host.textContent).toContain("Answer 9");
});
it("a slow response is shared across rapid navigation, with no duplicate requests", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  await show(); await click("Go through it together →");
  await click("‹ Back to page results"); await click("Go through it together →"); expect(requests()).toHaveBeenCalledTimes(1);
  await act(async () => resolve(Response.json(ready))); expect(button("Show next step")).toBeDefined();
});
it("clears private content on account replacement and ignores delayed replies", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  await show(); await click("Go through it together →");
  await act(async () => auth.callbacks.forEach(callback => callback("SIGNED_IN", { user: { id: "other-parent" } })));
  await act(async () => resolve(Response.json(ready)));
  expect(host.querySelector("img")).toBeNull(); expect(host.textContent).not.toContain("Answer 9"); expect(host.textContent).toContain("Sign in again");
});
it("strict mount effects do not leave explanations stuck after the first question opens", async () => {
  await show(data, true); await click("Go through it together →"); expect(button("Show next step")).toBeDefined(); expect(requests()).toHaveBeenCalledTimes(1);
});
it("newly ineligible questions immediately hide a previously loaded explanation", async () => {
  await show(); await click("Go through it together →"); await click("Show all"); expect(host.querySelectorAll(".spr-steps li")).toHaveLength(3);
  await show({ ...data, questions: data.questions.map(question => ({ ...question, explainable: false })) });
  expect(host.querySelector(".spr-steps")).toBeNull(); expect(host.textContent).toContain("An explanation is not available");
});
