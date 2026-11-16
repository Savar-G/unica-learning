// Server and worker metadata. Only these labels and a one-way identity can leave the process, never a credential.
import { createHash } from "node:crypto";

export const AI_USAGE_CONTEXTS = ["production", "practice", "evaluation", "test", "unknown"] as const;
export type AiUsageContext = (typeof AI_USAGE_CONTEXTS)[number];
export const AI_KEY_ALIASES = ["main", "marking", "explanations", "decisions", "local", "anthropic", "unknown", "maya", "workbook", "assessments", "profiles"] as const;
export type AiKeyAlias = (typeof AI_KEY_ALIASES)[number];
export function keyIdentity(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}
export function keyAlias(key: string, env: Readonly<Record<string, string | undefined>> = process.env): AiKeyAlias {
  const entries = [["MAYA_OPENROUTER_API_KEY", "maya"], ["WORKBOOK_OPENROUTER_API_KEY", "workbook"], ["ASSESSMENT_OPENROUTER_API_KEY", "assessments"], ["PROFILE_OPENROUTER_API_KEY", "profiles"], ["OPENROUTER_API_KEY", "main"], ["SCAN_MARKING_OPENROUTER_API_KEY", "marking"], ["PARENT_EXPLANATION_API_KEY", "explanations"], ["DECISIONS_OPENROUTER_API_KEY", "decisions"], ["ANTHROPIC_API_KEY", "anthropic"]] as const;
  return entries.find(([name]) => env[name]?.trim() === key.trim())?.[1] ?? "local";
}
export function usageContext(env: Readonly<Record<string, string | undefined>> = process.env): AiUsageContext {
  const value = env.AI_USAGE_CONTEXT;
  return AI_USAGE_CONTEXTS.includes(value as AiUsageContext) ? value as AiUsageContext : env.VERCEL_ENV === "production" ? "production" : "unknown";
}
