// Claude rejects some strict output schemas before generation. Select the format before the only HTTP request;
// keep the complete contract in trusted instructions and leave output validation to each existing caller.
// https://platform.claude.com/docs/en/build-with-claude/structured-outputs (read 2026-11-06).
import type { AiJsonRequest } from "@/lib/ai-client";

const UNSUPPORTED_BOUNDS = [
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "maxItems", "uniqueItems",
] as const;

/** The documented explicit limits and common unsupported bounds, not a complete JSON Schema validator. */
function needsInstructions(schema: Record<string, unknown>): boolean {
  let unions = 0;
  let optional = 0;
  function visit(value: unknown): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const s = value as Record<string, unknown>;
    if ((Array.isArray(s.anyOf) && s.anyOf.length > 1) || (Array.isArray(s.type) && s.type.length > 1)) unions++;
    if (UNSUPPORTED_BOUNDS.some((key) => s[key] !== undefined)) return true;
    if (s.minItems !== undefined && s.minItems !== 0 && s.minItems !== 1) return true;
    const properties = s.properties as Record<string, unknown> | undefined;
    const required = Array.isArray(s.required) ? s.required : [];
    if (properties) optional += Object.keys(properties).filter((key) => !required.includes(key)).length;
    if (unions > 16 || optional > 24) return true;
    // Visit schema positions only. Property names, descriptions, examples and enum values are not constraints.
    for (const key of ["properties", "$defs", "definitions", "patternProperties"]) {
      const map = s[key];
      if (map && typeof map === "object" && Object.values(map).some(visit)) return true;
    }
    for (const key of ["anyOf", "allOf", "oneOf", "prefixItems"]) {
      const list = s[key];
      if (Array.isArray(list) && list.some(visit)) return true;
    }
    return visit(s.items) || visit(s.additionalProperties);
  }
  return visit(schema);
}

/** Supported schemas keep their existing wire format. No retry or provider setting changes here. */
export function openRouterJsonOutput(model: string, request: AiJsonRequest) {
  if (model.startsWith("anthropic/claude-") && needsInstructions(request.schema)) {
    return {
      system: `${request.system}\n\nReturn only one JSON value that matches the complete schema below. Do not add Markdown fences or other text.\nJSON schema:\n${JSON.stringify(request.schema)}`,
    };
  }
  return {
    system: request.system,
    response_format: { type: "json_schema", json_schema: { name: request.name, strict: true, schema: request.schema } },
  };
}
