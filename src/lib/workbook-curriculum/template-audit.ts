/** A reproducible corpus audit. Data failures remain failures and do not alter the source. */
import { domainContains, prepareTemplateForAudit, seededRandom, slotDomain } from "./template";
import type { StepProgressions } from "./types";
export interface TemplateFailure {
  skill: string; step: number; template: number; phase: "prepare" | "fill";
  message: string; failedFills: number; firstSeed: number;
}
export interface TemplateAudit {
  steps: number; skills: number; templates: number; fillsPerTemplate: number; trials: number;
  passedFills: number; failedFills: number; failedTemplates: number; maxAttemptsUsed: number;
  failures: TemplateFailure[];
}
export function auditTemplates(source: StepProgressions, fillsPerTemplate = 30): TemplateAudit {
  if (!Number.isInteger(fillsPerTemplate) || fillsPerTemplate < 1 || fillsPerTemplate > 1000) throw new Error("Fills per template must be from 1 to 1000");
  const report: TemplateAudit = { steps: source.steps.length, skills: new Set(source.steps.map(s => s.skill)).size, templates: 0, fillsPerTemplate, trials: 0, passedFills: 0, failedFills: 0, failedTemplates: 0, maxAttemptsUsed: 0, failures: [] };
  for (const step of source.steps) for (const [i, template] of (step.templates ?? []).entries()) {
    const ordinal = report.templates++; let failed = false;
    let prepared: ReturnType<typeof prepareTemplateForAudit> | undefined, prepareError: unknown;
    try { prepared = prepareTemplateForAudit(step, template, source.contexts); } catch (e) { prepareError = e; }
    const groups = new Map<string, TemplateFailure>();
    for (let run = 0; run < fillsPerTemplate; run++) {
      // Stable across machines; every template/replicate pair has an independent seed.
      const seed = (Math.imul(ordinal + 1, 0x9e3779b1) + run) >>> 0; report.trials++;
      try {
        if (!prepared) throw prepareError;
        const filled = prepared.fill(seededRandom(seed));
        for (const [name, ref] of Object.entries(template.slots)) {
          const domain = slotDomain(step, ref), value = filled.values[name];
          if (!domainContains(domain, value)) throw new Error(`${name} is outside its range or values list`);
        }
        if (!filled.answer.length) throw new Error("Answer is empty");
        if (/[{}]/.test(filled.text)) throw new Error("Unfilled placeholder or literal brace in output");
        report.maxAttemptsUsed = Math.max(report.maxAttemptsUsed, filled.attempts); report.passedFills++;
      } catch (e) {
        failed = true; report.failedFills++;
        const message = e instanceof Error ? e.message : String(e), phase = prepared ? "fill" : "prepare";
        const key = `${phase}:${message}`, previous = groups.get(key);
        if (previous) previous.failedFills++;
        else groups.set(key, { skill: step.skill, step: step.number, template: i + 1, phase, message, failedFills: 1, firstSeed: seed });
      }
    }
    if (failed) report.failedTemplates++;
    report.failures.push(...groups.values());
  }
  return report;
}
