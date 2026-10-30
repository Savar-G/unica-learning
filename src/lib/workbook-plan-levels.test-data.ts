// Levels U2, U5, U10 and U19 from the curriculum skeleton (round 2, .design/workbooks/samples/curriculum-skeleton.xlsx),
// in the shape the planner reads (PlanLevel). Steps are drafted for Grade 3 only; elsewhere a skill has none.
import type { PlanLevel } from "@/lib/workbook-plan";

const skill = (id: string, delivery: "new-step" | "warm-up" | "activity" | "parent-checked", pages: number, steps = 0) => ({ id, delivery, pages, steps: Array.from({ length: steps }, (_, i) => ({ step: i + 1 })) });

export const U2: PlanLevel = {
  number: 2,
  workbooks: 2,
  units: [
    { code: "K2", skills: [skill("K2-subitize-to-5", "new-step", 11), skill("K2-five-frame", "new-step", 11), skill("K2-subitize-parts", "new-step", 11), skill("K2-make-5", "new-step", 11), skill("K2-ways-to-make-5", "new-step", 11), skill("K2-match-to-compare", "new-step", 7), skill("K2-compare-quantities", "new-step", 7), skill("K2-compare-numbers", "new-step", 7)] },
    { code: "K7", skills: [skill("K7-baseline", "activity", 1), skill("K7-compare-length", "new-step", 5), skill("K7-compare-mass-capacity", "activity", 1), skill("K7-compare-capacity", "activity", 1), skill("K7-which-attribute", "new-step", 2)] },
    { code: "K8", skills: [skill("K8-positional-words", "new-step", 2), skill("K8-describe-2d", "new-step", 5), skill("K8-describe-3d", "new-step", 5), skill("K8-same-shape", "new-step", 5), skill("K8-create-2d", "parent-checked", 5), skill("K8-shape-attributes", "new-step", 5)] },
  ],
};

export const U5: PlanLevel = {
  number: 5,
  workbooks: 4,
  units: [
    { code: "1.3", skills: [skill("1.3-meaning-of-addition", "new-step", 20), skill("1.3-meaning-of-subtraction", "new-step", 20), skill("1.3-add-within-10", "new-step", 20), skill("1.3-subtract-within-10", "new-step", 20), skill("1.3-count-on-back", "new-step", 27), skill("1.3-doubles", "warm-up", 0), skill("1.3-teen-add-subtract", "new-step", 20), skill("1.3-make-10-to-add", "new-step", 27), skill("1.3-add-within-20", "new-step", 27), skill("1.3-fact-families", "new-step", 20), skill("1.3-subtract-within-20", "new-step", 27), skill("1.3-word-problems-10", "new-step", 20), skill("1.3-word-problems-20", "new-step", 27)] },
    { code: "1.5", skills: [skill("1.5-describe-change", "new-step", 13), skill("1.5-change-to-make-10", "new-step", 13), skill("1.5-change-unknown", "new-step", 13)] },
  ],
};

export const U10: PlanLevel = {
  number: 10,
  workbooks: 4,
  units: [
    { code: "3.1", skills: [skill("3.1-place-value-1000", "new-step", 33, 4), skill("3.1-compare-order-1000", "new-step", 25, 4), skill("3.1-count-1000", "new-step", 17, 4), skill("3.1-estimate-quantity", "new-step", 17, 3)] },
    { code: "3.3", skills: [skill("3.3-add-within-1000", "new-step", 25, 4), skill("3.3-subtract-within-1000", "new-step", 33, 5), skill("3.3-word-problems-1000", "new-step", 17, 4)] },
    { code: "3.4", skills: [skill("3.4-recall-addition-20", "warm-up", 0, 3), skill("3.4-subtraction-facts-20", "warm-up", 0, 4)] },
    { code: "3.6", skills: [skill("3.6-increasing-pattern", "new-step", 25, 4), skill("3.6-decreasing-pattern", "new-step", 17, 3), skill("3.6-growth-amount", "new-step", 25, 3)] },
    { code: "3.13", skills: [skill("3.13-simulated-likelihood", "new-step", 11, 4), skill("3.13-independent-trials", "new-step", 8, 3)] },
  ],
};

export const U19: PlanLevel = {
  number: 19,
  workbooks: 4,
  units: [
    { code: "6.1", skills: [skill("6.1-place-value", "new-step", 16), skill("6.1-large-numbers", "new-step", 11), skill("6.1-compare-order", "new-step", 16)] },
    { code: "6.2", skills: [skill("6.2-fact-strategies", "warm-up", 0)] },
    { code: "6.3", skills: [skill("6.3-order-of-operations", "new-step", 16), skill("6.3-word-expressions", "new-step", 11)] },
    { code: "6.4", skills: [skill("6.4-prime-composite", "new-step", 12), skill("6.4-divisibility", "new-step", 12), skill("6.4-factors", "new-step", 12), skill("6.4-gcf", "new-step", 12), skill("6.4-lcm", "new-step", 16), skill("6.4-gcf-lcm-problems", "new-step", 11)] },
    { code: "6.13", skills: [skill("6.13-classify-angles", "new-step", 5), skill("6.13-measure-angles", "new-step", 8), skill("6.13-angle-sums", "new-step", 8)] },
    { code: "6.11", skills: [skill("6.11-complex-perimeter", "new-step", 8)] },
    { code: "6.18", skills: [skill("6.18-theoretical", "new-step", 8), skill("6.18-experimental", "new-step", 8), skill("6.18-compare", "new-step", 4)] },
  ],
};

