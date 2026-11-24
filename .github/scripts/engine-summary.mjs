#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ENGINE_TEST_BUDGET_SECONDS = 15;

export function formatEngineSummary({ durationMs, outcome = "", budgetSeconds = ENGINE_TEST_BUDGET_SECONDS } = {}) {
  const raw = durationMs === undefined || durationMs === null ? "" : String(durationMs).trim();
  const parsed = raw === "" ? Number.NaN : Number(raw);
  const outcomeNote = outcome ? ` (outcome: ${outcome})` : "";

  if (!Number.isFinite(parsed) || parsed < 0) {
    return `### Workbook engine tests\n\n- Time: not recorded${outcomeNote}\n- Budget: ${budgetSeconds} s\n`;
  }

  const seconds = (parsed / 1000).toFixed(2);
  const budgetNote = parsed <= budgetSeconds * 1000 ? "within budget" : "over budget";
  return `### Workbook engine tests\n\n- Time: ${seconds} s (${budgetNote})${outcomeNote}\n- Budget: ${budgetSeconds} s\n`;
}

export function writeEngineSummary({
  durationMs = process.env.DURATION_MS,
  outcome = process.env.TEST_OUTCOME ?? "",
  summaryPath = process.env.GITHUB_STEP_SUMMARY ?? "",
  stdout = process.stdout,
} = {}) {
  const markdown = formatEngineSummary({ durationMs, outcome });
  if (summaryPath) {
    appendFileSync(summaryPath, markdown);
  }
  stdout.write(markdown);
  return markdown;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  writeEngineSummary();
}
