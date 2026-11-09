import { describe, expect, it } from "vitest";
import { STALE_SECONDS } from "@/lib/workbook-job";
import { plainRunError, runProgress, WARN_SECONDS } from "@/lib/workbook-run-progress";

const NOW = new Date("2026-11-05T12:00:00Z");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString();

const run = (o: Partial<Parameters<typeof runProgress>[0]> = {}): Parameters<typeof runProgress>[0] => ({
  step: "write", attempts: 1, maxAttempts: 2, donePages: 20, totalPages: 80, heartbeatAt: ago(5), createdAt: ago(900), startedAt: ago(800), resumes: 0, errors: [], ...o,
});
/** `count` pages, the newest `newest` seconds ago, `every` seconds apart. */
const pages = (count: number, every: number, newest = 5) => Array.from({ length: count }, (_, i) => ago(newest + (count - 1 - i) * every));
const activity = (pageTimes: string[], lastWorkAt = pageTimes.at(-1) ?? null) => ({ pageTimes, lastWorkAt });

describe("is the run working", () => {
  it("names the time of the last saved work while pages are written", () => {
    expect(runProgress(run(), activity(pages(20, 5, 12)), NOW).signal).toEqual({ warn: false, text: "Working. Last saved work 12 seconds ago." });
  });

  it("names the job's signal, not saved work, in a step that saves nothing", () => {
    for (const step of ["plan", "render", "save"] as const) {
      const v = runProgress(run({ step, donePages: 80, heartbeatAt: ago(1) }), activity([], ago(600)), NOW);
      expect(v.signal).toEqual({ warn: false, text: "Working. Last signal from the job 1 second ago." });
    }
  });

  it("warns when the job goes silent, with the time and the real stop rule", () => {
    const v = runProgress(run({ heartbeatAt: ago(WARN_SECONDS + 60) }), activity(pages(20, 5)), NOW);
    expect(v.signal.warn).toBe(true);
    expect(v.signal.text).toBe(`No signal from the job for 3 minutes. If nothing moves for ${STALE_SECONDS / 60} minutes, pressing Prepare next workbook again takes the run up again.`);
    expect(v.timeLeft).toBe("Time left is not known until the run moves again.");
  });

  it("warns when the job beats but saves nothing, and does not say the run will stop soon", () => {
    const v = runProgress(run(), activity(pages(20, 5, 180)), NOW);
    expect(v.signal.warn).toBe(true);
    expect(v.signal.text).toContain("still running");
    expect(v.signal.text).toContain("saved for 3 minutes");
    expect(v.signal.text).toContain("If the job sends no signal for 6 minutes");
    expect(v.timeLeft).toBe("Time left is not known until the run moves again.");
  });

  it("does not warn just before the limit, and warns at it", () => {
    expect(runProgress(run({ heartbeatAt: ago(WARN_SECONDS - 1) }), activity(pages(20, 5)), NOW).signal.warn).toBe(false);
    expect(runProgress(run({ heartbeatAt: ago(WARN_SECONDS) }), activity(pages(20, 5)), NOW).signal.warn).toBe(true);
  });

  it("does not warn about saved work during the plan, the whole-book check or the render, however long they take", () => {
    for (const r of [run({ step: "plan", donePages: null, totalPages: null }), run({ donePages: 80 }), run({ step: "render", donePages: 80 })]) {
      expect(runProgress(r, activity(pages(80, 5, 400)), NOW).signal.warn).toBe(false);
    }
  });

  it("starts the wait for saved work again on a new try", () => {
    const errors = [{ attempt: 1, at: ago(30), error: "lost" }];
    const v = runProgress(run({ attempts: 2, errors }), activity(pages(20, 5, 600)), NOW);
    expect(v.signal).toEqual({ warn: false, text: "Working. No new page or AI answer has been saved yet. Last signal from the job 5 seconds ago." });
  });

  it("shows no negative time when the database clock is ahead", () => {
    expect(runProgress(run({ heartbeatAt: ago(-3) }), activity(pages(20, 5, -3)), NOW).signal.text).toBe("Working. Last saved work 0 seconds ago.");
  });
});

describe("how much is left", () => {
  it("estimates from this run's pace, adds the steps after the pages, and rounds up", () => {
    // 60 pages left at 10 s a page, plus 120 s after the pages: 720 s.
    expect(runProgress(run(), activity(pages(20, 10)), NOW).timeLeft).toBe("About 12 minutes left.");
    // 61 pages left is 730 s, which rounds up.
    expect(runProgress(run({ donePages: 19 }), activity(pages(19, 10)), NOW).timeLeft).toBe("About 13 minutes left.");
  });

  it("says 'about' and never gives zero or a negative time", () => {
    const v = runProgress(run({ donePages: 79, totalPages: 80 }), activity(pages(79, 1)), NOW);
    expect(v.timeLeft).toMatch(/^About [1-9]\d* minutes? left\.$/);
    expect(runProgress(run({ donePages: 200, totalPages: 80 }), activity(pages(20, 10)), NOW).timeLeft).toBe("No time estimate for this step.");
  });

  it("says it is working out the time until enough pages are saved", () => {
    expect(runProgress(run({ donePages: 7 }), activity(pages(7, 30)), NOW).timeLeft).toBe("Working out the time left.");
  });

  it("does not take the pace from a fast first burst of pages", () => {
    expect(runProgress(run({ donePages: 12 }), activity(pages(12, 1)), NOW).timeLeft).toBe("Working out the time left.");
  });

  it("does not let pages kept from before a resume make the pace look fast or slow", () => {
    // 60 kept pages saved in a burst an hour ago, then 3 new ones: not enough to know the pace.
    const kept = pages(60, 1, 3600);
    expect(runProgress(run({ donePages: 63 }), activity([...kept, ...pages(3, 30)]), NOW).timeLeft).toBe("Working out the time left.");
    // With 10 new pages, only those count: 17 left at 30 s a page plus 120 s is 630 s.
    expect(runProgress(run({ donePages: 63 }), activity([...kept, ...pages(10, 30)]), NOW).timeLeft).toBe("About 11 minutes left.");
  });

  it("counts only pages saved after the newest failed try", () => {
    const errors = [{ attempt: 1, at: ago(100), error: "lost" }];
    expect(runProgress(run({ attempts: 2, errors, donePages: 62 }), activity([...pages(60, 1, 200), ...pages(2, 10)]), NOW).timeLeft).toBe("Working out the time left.");
    expect(runProgress(run({ attempts: 2, errors, donePages: 69 }), activity([...pages(60, 1, 200), ...pages(9, 10)]), NOW).timeLeft).toBe("About 4 minutes left.");
  });

  it("gives the plan's measured time, and says no pages show yet", () => {
    const v = runProgress(run({ step: "plan", donePages: null, totalPages: null }), activity([]), NOW);
    expect(v.step).toBe("Planning the two weeks");
    expect(v.pages).toBeNull();
    expect(v.timeLeft).toBe("Working out the time left. Planning can take 8 minutes or more on a busy Mac, and no pages show until it ends.");
  });
});

describe("the steps after the day pages", () => {
  it("names the whole-book check, with no time, once every page is written", () => {
    const v = runProgress(run({ donePages: 80 }), activity(pages(80, 5)), NOW);
    expect(v.step).toBe("Checking the whole book and storing the draft");
    expect(v.timeLeft).toBe("No time estimate for this step.");
  });

  it.each([["render", "Making the PDF and page images"], ["save", "Saving the draft"]] as const)("names the %s step and says it has no page count", (step, name) => {
    const v = runProgress(run({ step, donePages: 80 }), activity(pages(80, 5)), NOW);
    expect(v.step).toBe(name);
    expect(v.timeLeft).toBe("No page count for this step. It took under 2 minutes on past runs.");
  });
});

describe("a run that tries again", () => {
  it("says why the try stopped, in plain words", () => {
    const errors = [{ attempt: 1, at: ago(30), error: "Failed to launch the browser process:  Code: null\n\nstderr:\n\n\nTROUBLESHOOTING: https://pptr.dev/troubleshooting\n" }];
    const v = runProgress(run({ attempts: 2, errors }), activity(pages(20, 5)), NOW);
    expect(v.retry).toBe("Try 1 stopped: the program that prints the pages did not start. Trying again.");
    expect(v.tries).toBe("Try 2 of 2");
  });

  it("shows nothing on a first try", () => {
    const v = runProgress(run(), activity(pages(20, 5)), NOW);
    expect(v.retry).toBeNull();
    expect(v.tries).toBeNull();
  });
});

describe("plain error words", () => {
  it.each([
    ["Timed out after 30000 ms while waiting for the WS endpoint URL to appear in stdout!", "the program that prints the pages did not start"],
    ["Protocol error (Target.setAutoAttach): Target closed", "the program that prints the pages stopped"],
    ["the operation was aborted", "a step took too long"],
    ["could not upload page-1.png to storage", "a file did not save"],
    ['workbook run attempts use: new row for relation "workbook_run_attempts" violates check constraint "x"', "a database write failed"],
  ])("%s", (error, plain) => {
    expect(plainRunError(error)).toBe(plain);
  });

  it("shows only the first line of an error it does not know", () => {
    expect(plainRunError("Something new happened.\nstack line")).toBe("Something new happened");
  });
});
