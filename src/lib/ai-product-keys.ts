// One OpenRouter credential serves one product. Feature ownership comes from code, never from a model or a prompt.
import type { AiFeature } from "@/lib/ai-usage";

export const AI_PRODUCTS = {
  maya: "MAYA_OPENROUTER_API_KEY",
  marking: "SCAN_MARKING_OPENROUTER_API_KEY",
  explanations: "PARENT_EXPLANATION_API_KEY",
  workbook: "WORKBOOK_OPENROUTER_API_KEY",
  assessments: "ASSESSMENT_OPENROUTER_API_KEY",
  profiles: "PROFILE_OPENROUTER_API_KEY",
} as const;
export type AiProduct = keyof typeof AI_PRODUCTS;

export const AI_FEATURE_PRODUCTS = {
  maya: "maya", maya_review: "maya", maya_note: "maya", maya_speech: "maya",
  marking: "marking", photo_check: "marking",
  explain: "explanations",
  workbook: "workbook", solve_check: "workbook", workbook_gate: "workbook",
  report: "assessments", work_review: "assessments",
  child_profile: "profiles", learner_profile: "profiles",
} as const satisfies Partial<Record<AiFeature, AiProduct>>;

/** An unassigned feature has no paid client. Historical feature "other" is still readable. */
export function featureProduct(feature: string | undefined): AiProduct | null {
  return feature && Object.hasOwn(AI_FEATURE_PRODUCTS, feature)
    ? AI_FEATURE_PRODUCTS[feature as keyof typeof AI_FEATURE_PRODUCTS] : null;
}

/** No generic fallback. Any duplicate product binding closes all product clients, without logging credentials. */
export function productKey(feature: string | undefined, env: Readonly<Record<string, string | undefined>> = process.env): { apiKey: string; keyLabel: AiProduct } | null {
  const product = featureProduct(feature);
  if (!product) return null;
  const configured = Object.values(AI_PRODUCTS).map((name) => env[name]?.trim()).filter((key): key is string => !!key);
  if (new Set(configured).size !== configured.length) return null;
  const apiKey = env[AI_PRODUCTS[product]]?.trim();
  return apiKey ? { apiKey, keyLabel: product } : null;
}
