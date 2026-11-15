// The weekly ad review (docs/ad-tracking.md, "Weekly review"). Pure: no network, database or clock.
// Input: the visits of one time window, each with the signup steps it reached and the family it became, plus
// optional spend that a person typed in by hand. Output: a funnel for each ad, step rates, cost per signup when spend
// is known, and one verdict for each ad: scale, keep, kill or not enough data, with the reason.
//
// The review never changes an ad or a budget. A person reads the verdicts and approves every change in Meta or Google
// Ads. The verdicts are a proposal, not an action.

/** The signup steps of public.ad_visit_steps (migration 20261022_add_ad_visit_steps.sql). */
export type AdStep = "start_open" | "form_start" | "google_start" | "code_sent";

/** One ad visit (a row of public.ad_visits), with what the visit did after it. */
export type AdVisitRecord = {
  visitId: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  /** The steps this visit reached (public.ad_visit_steps). */
  steps: readonly AdStep[];
  /** The family this visit became (parents.source->>'visit_id'), or null when it did not sign up. */
  familyId: string | null;
};

/** Spend typed in by hand for one ad, in CAD. Several entries for the same ad add up (for example one per day). */
export type AdSpendEntry = {
  source: string;
  campaign: string;
  content: string;
  /** Optional: when set, the entry counts only for visits with this medium (for example one placement). */
  medium?: string;
  amount: number;
};

export type AdReviewInput = {
  visits: readonly AdVisitRecord[];
  /** Families to leave out: test families (public.test_accounts) and team accounts (admin_team_ids()). */
  excludedFamilyIds?: Iterable<string>;
  spend?: readonly AdSpendEntry[];
};

export type AdVerdict = "scale" | "keep" | "kill" | "not-enough-data";

export type AdFunnel = {
  visits: number;
  /** Visits that opened /start. */
  startOpen: number;
  /** Visits where the parent typed in the form or chose Google. */
  formOrGoogle: number;
  /** Visits where the email code was sent. */
  codeSent: number;
  /** Visits that became a family. */
  signups: number;
};

export type AdPlacement = { medium: string; visits: number; startOpen: number };

export type AdReview = {
  /** The ad: source, campaign and content, as in the ad's link. "(none)" stands for a missing tag. */
  source: string;
  campaign: string;
  content: string;
  funnel: AdFunnel;
  /** Share of visits that reached each step (0 to 1), and of the step before for the step-to-step rates. */
  rates: {
    startOpenOfVisits: number | null;
    formOrGoogleOfOpens: number | null;
    codeSentOfForms: number | null;
    signupsOfVisits: number | null;
  };
  /** Visits by placement (utm_medium), most visits first. */
  placements: AdPlacement[];
  /** Spend in CAD from the hand-typed entries, or null when none matched this ad. */
  spend: number | null;
  costPerVisit: number | null;
  costPerOpen: number | null;
  costPerSignup: number | null;
  verdict: AdVerdict;
  /** Why, in plain words. Always set. */
  reason: string;
  /** Things to look at that the verdict does not cover, for example a signup page problem. */
  notes: string[];
};

export type AdReviewResult = {
  ads: AdReview[];
  /** Visits left out because their family is a test or team family. */
  excludedVisits: number;
  /** Spend entries that matched no ad with visits (an ad that got no visits, or a typo in a tag). */
  unmatchedSpend: AdSpendEntry[];
};

/** A verdict needs this many visits to the ad. Why: with 0 opens in n visits, the real open rate can still be as high
 *  as about 3 / n (the rule of three, 95% bound), so 100 visits only rules out a rate above 3%. Round 2 Meta read
 *  0 opens in 101 visits. Below this the review says "not enough data" instead of guessing. */
export const MIN_VISITS_FOR_VERDICT = 100;

/** An ad needs this many opens of /start before it can win. Same as the Round 3 plan: "at least 3 opens". */
export const MIN_OPENS_TO_SCALE = 3;

/** One ad wins or loses against another only when its open rate is at least this many times the other's. Same as the
 *  Round 3 plan: "at least twice the opens of the next ad". It is a rate here, not a count, because two ads rarely
 *  get the same number of visits. */
export const WIN_RATIO = 2;

/** An ad with no other ad to compare with (the only ad of its campaign with enough visits) can win only with at least
 *  this open rate. Why: 5% is above the 3% the round 3 plan calls a weak result and below the 9% it calls strong. */
export const SOLO_SCALE_OPEN_RATE = 0.05;

/** Opens of /start with nobody typing in at all: look at the signup page, not at the ad. */
export const SIGNUP_PAGE_NOTE_MIN_OPENS = 10;

const NONE = "(none)";
const tag = (v: string | null | undefined) => (v && v.trim() ? v : NONE);
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

type Group = { source: string; campaign: string; content: string; visits: AdVisitRecord[] };

/** Builds the review. Visits of an excluded family are dropped, so team and test visitors never count as traffic. */
export function reviewAds(input: AdReviewInput): AdReviewResult {
  const excluded = new Set(input.excludedFamilyIds ?? []);
  const groups = new Map<string, Group>();
  let excludedVisits = 0;
  for (const visit of input.visits) {
    if (visit.familyId !== null && excluded.has(visit.familyId)) { excludedVisits++; continue; }
    const source = tag(visit.source), campaign = tag(visit.campaign), content = tag(visit.content);
    const key = JSON.stringify([source, campaign, content]);
    const group = groups.get(key) ?? { source, campaign, content, visits: [] };
    group.visits.push(visit);
    groups.set(key, group);
  }

  const spendOf = (group: Group): number | null => {
    let total: number | null = null;
    for (const e of input.spend ?? []) {
      if (e.source !== group.source || e.campaign !== group.campaign || e.content !== group.content) continue;
      const matching = e.medium === undefined ? group.visits.length : group.visits.filter((v) => tag(v.medium) === e.medium).length;
      // An entry that names a placement with no visits there is left for the unmatched list.
      if (e.medium !== undefined && matching === 0) continue;
      total = (total ?? 0) + e.amount;
    }
    return total;
  };

  const ads = [...groups.values()].map((group): AdReview => {
    const funnel = funnelOf(group.visits);
    const spend = spendOf(group);
    const byMedium = new Map<string, AdVisitRecord[]>();
    for (const v of group.visits) byMedium.set(tag(v.medium), [...(byMedium.get(tag(v.medium)) ?? []), v]);
    return {
      source: group.source, campaign: group.campaign, content: group.content, funnel,
      rates: {
        startOpenOfVisits: ratio(funnel.startOpen, funnel.visits),
        formOrGoogleOfOpens: ratio(funnel.formOrGoogle, funnel.startOpen),
        codeSentOfForms: ratio(funnel.codeSent, funnel.formOrGoogle),
        signupsOfVisits: ratio(funnel.signups, funnel.visits),
      },
      placements: [...byMedium].map(([medium, vs]) => ({ medium, visits: vs.length, startOpen: vs.filter((v) => reached(v, ["start_open"])).length }))
        .sort((a, b) => b.visits - a.visits || a.medium.localeCompare(b.medium)),
      spend,
      costPerVisit: spend === null ? null : ratio(spend, funnel.visits),
      costPerOpen: spend === null ? null : ratio(spend, funnel.startOpen),
      costPerSignup: spend === null ? null : ratio(spend, funnel.signups),
      verdict: "not-enough-data", reason: "", notes: [],
    };
  });

  for (const ad of ads) {
    const siblings = ads.filter((o) => o !== ad && o.source === ad.source && o.campaign === ad.campaign && o.funnel.visits >= MIN_VISITS_FOR_VERDICT);
    Object.assign(ad, judge(ad, siblings));
  }
  ads.sort((a, b) => a.source.localeCompare(b.source) || a.campaign.localeCompare(b.campaign) || b.funnel.visits - a.funnel.visits || a.content.localeCompare(b.content));

  const known = new Set(ads.map((a) => JSON.stringify([a.source, a.campaign, a.content])));
  const unmatchedSpend = (input.spend ?? []).filter((e) => {
    if (!known.has(JSON.stringify([e.source, e.campaign, e.content]))) return true;
    if (e.medium === undefined) return false;
    return !ads.some((a) => a.source === e.source && a.campaign === e.campaign && a.content === e.content && a.placements.some((p) => p.medium === e.medium));
  });
  return { ads, excludedVisits, unmatchedSpend };
}

const reached = (visit: AdVisitRecord, steps: readonly AdStep[]) => steps.some((s) => visit.steps.includes(s));

function funnelOf(visits: readonly AdVisitRecord[]): AdFunnel {
  return {
    visits: visits.length,
    startOpen: visits.filter((v) => reached(v, ["start_open"])).length,
    formOrGoogle: visits.filter((v) => reached(v, ["form_start", "google_start"])).length,
    codeSent: visits.filter((v) => reached(v, ["code_sent"])).length,
    signups: visits.filter((v) => v.familyId !== null).length,
  };
}

/** The verdict of one ad against the other ads of its campaign that have enough visits. */
function judge(ad: AdReview, siblings: readonly AdReview[]): Pick<AdReview, "verdict" | "reason" | "notes"> {
  const f = ad.funnel;
  const notes: string[] = [];
  if (f.startOpen >= SIGNUP_PAGE_NOTE_MIN_OPENS && f.formOrGoogle === 0) {
    notes.push(`${f.startOpen} visits opened /start and nobody typed in or chose Google. Check the signup page before blaming the ad.`);
  }
  if (f.visits < MIN_VISITS_FOR_VERDICT) {
    return { verdict: "not-enough-data", reason: `${f.visits} visits; a verdict needs at least ${MIN_VISITS_FOR_VERDICT}.`, notes };
  }
  const rate = f.startOpen / f.visits;
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
  const best = siblings.reduce<AdReview | null>((m, s) => (m === null || s.funnel.startOpen / s.funnel.visits > m.funnel.startOpen / m.funnel.visits ? s : m), null);
  const bestRate = best ? best.funnel.startOpen / best.funnel.visits : 0;

  if (f.startOpen === 0) {
    return { verdict: "kill", reason: `0 opens of /start in ${f.visits} visits.`, notes };
  }
  if (best && best.funnel.startOpen >= MIN_OPENS_TO_SCALE && bestRate >= WIN_RATIO * rate) {
    return { verdict: "kill", reason: `Open rate ${pct(rate)} is less than half of "${best.content}" at ${pct(bestRate)} (${best.funnel.startOpen} opens).`, notes };
  }
  if (f.startOpen >= MIN_OPENS_TO_SCALE) {
    if (best && rate >= WIN_RATIO * bestRate) {
      return { verdict: "scale", reason: `${f.startOpen} opens, and open rate ${pct(rate)} is at least ${WIN_RATIO} times the best other ad ("${best.content}", ${pct(bestRate)}).`, notes };
    }
    if (!best && rate >= SOLO_SCALE_OPEN_RATE) {
      return { verdict: "scale", reason: `${f.startOpen} opens, open rate ${pct(rate)}, above the ${pct(SOLO_SCALE_OPEN_RATE)} floor. No other ad of this campaign to compare with.`, notes };
    }
  }
  const why = best ? `Not clearly better or worse than "${best.content}" (${pct(rate)} against ${pct(bestRate)}).` : `Open rate ${pct(rate)}, no other ad of this campaign to compare with.`;
  return { verdict: "keep", reason: `${f.startOpen} opens in ${f.visits} visits. ${why}`, notes };
}

const money = (n: number | null) => (n === null ? "-" : `CAD ${n.toFixed(2)}`);
const share = (n: number | null) => (n === null ? "-" : `${(n * 100).toFixed(1)}%`);
const VERDICT_LABEL: Record<AdVerdict, string> = { scale: "SCALE", keep: "KEEP", kill: "KILL", "not-enough-data": "NOT ENOUGH DATA" };

/** The Markdown report. `window` is a plain-language label such as "last 7 days"; `from` and `to` are dates for the header. */
export function renderAdReview(result: AdReviewResult, header: { window: string; from: string; to: string }): string {
  const out: string[] = [];
  out.push(`# Ad review: ${header.window}`, "", `Window: ${header.from} to ${header.to}. Counts come from our own tables, test and team families left out (${result.excludedVisits} visits dropped).`);
  out.push("", "These are proposals. Nothing was changed in Meta or Google Ads, and a person approves every change.", "");
  if (result.ads.length === 0) out.push("No ad visits in this window.", "");
  else {
    out.push("| Ad | Verdict | Visits | Opened /start | Form or Google | Code sent | Signups | Spend | Per signup |", "|---|---|---:|---:|---:|---:|---:|---:|---:|");
    for (const a of result.ads) {
      const f = a.funnel;
      out.push(`| ${a.source} / ${a.campaign} / ${a.content} | ${VERDICT_LABEL[a.verdict]} | ${f.visits} | ${f.startOpen} (${share(a.rates.startOpenOfVisits)}) | ${f.formOrGoogle} | ${f.codeSent} | ${f.signups} | ${money(a.spend)} | ${money(a.costPerSignup)} |`);
    }
    out.push("");
    for (const a of result.ads) {
      out.push(`## ${a.source} / ${a.campaign} / ${a.content}: ${VERDICT_LABEL[a.verdict]}`, "", a.reason, "");
      const f = a.funnel;
      out.push(`- Funnel: ${f.visits} visits, ${f.startOpen} opened /start, ${f.formOrGoogle} typed in or chose Google, ${f.codeSent} got the code, ${f.signups} signed up.`);
      out.push(`- Step rates: opened ${share(a.rates.startOpenOfVisits)} of visits; typed in ${share(a.rates.formOrGoogleOfOpens)} of opens; code sent ${share(a.rates.codeSentOfForms)} of those; signed up ${share(a.rates.signupsOfVisits)} of visits.`);
      if (a.spend !== null) out.push(`- Spend ${money(a.spend)}: ${money(a.costPerVisit)} a visit, ${money(a.costPerOpen)} an open, ${money(a.costPerSignup)} a signup.`);
      else out.push("- Spend: not given, so no cost figures.");
      if (a.placements.length > 1) out.push(`- Placements: ${a.placements.map((p) => `${p.medium} ${p.visits} ${p.visits === 1 ? "visit" : "visits"}, ${p.startOpen} ${p.startOpen === 1 ? "open" : "opens"}`).join("; ")}.`);
      for (const n of a.notes) out.push(`- Note: ${n}`);
      out.push("");
    }
  }
  if (result.unmatchedSpend.length > 0) {
    out.push("## Spend that matched no ad", "", "Check the tags. Either the ad got no visits in this window, or the tags do not match the ad's link.", "");
    for (const e of result.unmatchedSpend) out.push(`- ${e.source} / ${e.campaign} / ${e.content}${e.medium ? ` / ${e.medium}` : ""}: ${money(e.amount)}`);
    out.push("");
  }
  out.push("## How to read this", "",
    `- A verdict needs at least ${MIN_VISITS_FOR_VERDICT} visits to the ad. Below that, the report says "not enough data".`,
    `- SCALE: at least ${MIN_OPENS_TO_SCALE} opens of /start and an open rate at least ${WIN_RATIO} times the best other ad of the campaign (or, with no other ad, at least ${share(SOLO_SCALE_OPEN_RATE)}).`,
    `- KILL: 0 opens, or another ad has at least ${MIN_OPENS_TO_SCALE} opens and at least ${WIN_RATIO} times this ad's open rate.`,
    "- KEEP: enough visits, and not clearly better or worse. A tie means the next test is the home page or the signup page, not another ad.",
    "- A visit is one browser tab. Cost per signup shows only when spend was given and at least one visit signed up.", "");
  return out.join("\n");
}
