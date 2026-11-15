import { describe, expect, it } from "vitest";
import { MIN_VISITS_FOR_VERDICT, renderAdReview, reviewAds, type AdStep, type AdVisitRecord } from "./ad-review";

let n = 0;
/** `count` visits to one ad; the first `opens` of them opened /start, and the first `families` became a family. */
function visits(content: string, count: number, opens: number, families = 0, over: Partial<AdVisitRecord> = {}): AdVisitRecord[] {
  return Array.from({ length: count }, (_, i): AdVisitRecord => {
    const steps: AdStep[] = i < opens ? ["start_open"] : [];
    if (i < families) steps.push("form_start", "code_sent");
    return { visitId: `v${++n}`, source: "meta", medium: "paid_social", campaign: "bc-round-3", content, steps, familyId: i < families ? `f${n}` : null, ...over };
  });
}
const ad = (r: ReturnType<typeof reviewAds>, content: string) => {
  const found = r.ads.find((a) => a.content === content);
  if (!found) throw new Error(`no ad ${content}`);
  return found;
};

describe("reviewAds", () => {
  it("gives no verdict below the minimum sample, even for a loser", () => {
    const r = reviewAds({ visits: visits("right-level", MIN_VISITS_FOR_VERDICT - 1, 0) });
    expect(ad(r, "right-level").verdict).toBe("not-enough-data");
    expect(ad(r, "right-level").reason).toContain("verdict needs at least");
  });

  it("kills an ad with no opens once the sample is enough", () => {
    const r = reviewAds({ visits: visits("right-level", MIN_VISITS_FOR_VERDICT, 0) });
    expect(ad(r, "right-level").verdict).toBe("kill");
  });

  it("proposes scale for a clear winner and kill for the clear loser beside it", () => {
    const r = reviewAds({ visits: [...visits("right-level", 120, 9), ...visits("all-of-this", 120, 2)] });
    expect(ad(r, "right-level").verdict).toBe("scale");
    expect(ad(r, "all-of-this").verdict).toBe("kill");
  });

  it("keeps two ads that are close", () => {
    const r = reviewAds({ visits: [...visits("right-level", 120, 6), ...visits("all-of-this", 120, 5)] });
    expect(ad(r, "right-level").verdict).toBe("keep");
    expect(ad(r, "all-of-this").verdict).toBe("keep");
  });

  it("does not scale an ad with fewer than 3 opens, even at twice the rate", () => {
    const r = reviewAds({ visits: [...visits("right-level", 120, 2), ...visits("all-of-this", 120, 1)] });
    expect(ad(r, "right-level").verdict).toBe("keep");
  });

  it("does not compare with an ad that has too few visits", () => {
    const r = reviewAds({ visits: [...visits("right-level", 120, 4), ...visits("all-of-this", 10, 5)] });
    expect(ad(r, "right-level").verdict).toBe("keep");
    expect(ad(r, "all-of-this").verdict).toBe("not-enough-data");
  });

  it("scales a lone ad only above the open-rate floor", () => {
    expect(ad(reviewAds({ visits: visits("solo", 100, 6) }), "solo").verdict).toBe("scale");
    expect(ad(reviewAds({ visits: visits("solo", 100, 4) }), "solo").verdict).toBe("keep");
  });

  it("compares ads of one campaign only", () => {
    const r = reviewAds({ visits: [...visits("right-level", 120, 9), ...visits("other", 120, 1, 0, { campaign: "other-campaign" })] });
    expect(ad(r, "right-level").verdict).toBe("scale");
    expect(ad(r, "other").verdict).toBe("keep");
  });

  it("counts the funnel and the step rates", () => {
    const vs = visits("right-level", 100, 10, 2);
    vs[5]!.steps = ["start_open", "google_start"];
    const a = ad(reviewAds({ visits: vs }), "right-level");
    expect(a.funnel).toEqual({ visits: 100, startOpen: 10, formOrGoogle: 3, codeSent: 2, signups: 2 });
    expect(a.rates.startOpenOfVisits).toBeCloseTo(0.1);
    expect(a.rates.formOrGoogleOfOpens).toBeCloseTo(0.3);
  });

  it("works without spend, and gives costs when spend is given", () => {
    const vs = visits("right-level", 100, 10, 2);
    const without = ad(reviewAds({ visits: vs }), "right-level");
    expect([without.spend, without.costPerVisit, without.costPerOpen, without.costPerSignup]).toEqual([null, null, null, null]);
    const withSpend = ad(reviewAds({ visits: vs, spend: [
      { source: "meta", campaign: "bc-round-3", content: "right-level", amount: 20 },
      { source: "meta", campaign: "bc-round-3", content: "right-level", amount: 10 },
    ] }), "right-level");
    expect(withSpend.spend).toBe(30);
    expect(withSpend.costPerVisit).toBeCloseTo(0.3);
    expect(withSpend.costPerOpen).toBeCloseTo(3);
    expect(withSpend.costPerSignup).toBeCloseTo(15);
  });

  it("gives no cost per signup when nobody signed up", () => {
    const a = ad(reviewAds({ visits: visits("right-level", 100, 10), spend: [{ source: "meta", campaign: "bc-round-3", content: "right-level", amount: 30 }] }), "right-level");
    expect(a.costPerSignup).toBeNull();
    expect(a.costPerOpen).toBeCloseTo(3);
  });

  it("lists spend that matches no ad", () => {
    const stray = { source: "google", campaign: "bc-round-3", content: "none-here", amount: 5 };
    const r = reviewAds({ visits: visits("right-level", 100, 10), spend: [stray] });
    expect(r.unmatchedSpend).toEqual([stray]);
  });

  it("leaves out visits of test and team families", () => {
    const vs = visits("right-level", 100, 10, 4);
    const team = vs.filter((v) => v.familyId !== null).slice(0, 2).map((v) => v.familyId!);
    const r = reviewAds({ visits: vs, excludedFamilyIds: team });
    const a = ad(r, "right-level");
    expect(r.excludedVisits).toBe(2);
    expect(a.funnel.visits).toBe(98);
    expect(a.funnel.signups).toBe(2);
    expect(a.funnel.startOpen).toBe(8);
  });

  it("splits placements and reports them", () => {
    const vs = [...visits("right-level", 60, 3, 0, { medium: "Instagram_Reels" }), ...visits("right-level", 50, 3, 0, { medium: "Facebook_Feed" })];
    const a = ad(reviewAds({ visits: vs }), "right-level");
    expect(a.funnel.visits).toBe(110);
    expect(a.placements).toEqual([
      { medium: "Instagram_Reels", visits: 60, startOpen: 3 },
      { medium: "Facebook_Feed", visits: 50, startOpen: 3 },
    ]);
  });

  it("notes a signup page problem when visitors open /start and nobody types in", () => {
    const a = ad(reviewAds({ visits: visits("right-level", 100, 12) }), "right-level");
    expect(a.notes.join(" ")).toContain("Check the signup page");
  });
});

describe("renderAdReview", () => {
  it("prints the table, the verdict and the rule text, and says nothing was changed", () => {
    const md = renderAdReview(reviewAds({ visits: [...visits("right-level", 120, 9, 1), ...visits("all-of-this", 120, 2)] }), { window: "last 7 days", from: "2026-11-07", to: "2026-11-14" });
    expect(md).toContain("# Ad review: last 7 days");
    expect(md).toContain("meta / bc-round-3 / right-level | SCALE");
    expect(md).toContain("meta / bc-round-3 / all-of-this | KILL");
    expect(md).toContain("Nothing was changed in Meta or Google Ads");
    expect(md).not.toContain(String.fromCharCode(0x2014));
  });

  it("says so when there are no visits", () => {
    expect(renderAdReview(reviewAds({ visits: [] }), { window: "last 7 days", from: "a", to: "b" })).toContain("No ad visits in this window.");
  });
});
