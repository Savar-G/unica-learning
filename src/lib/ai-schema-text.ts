// A JSON schema that does not go through constrained decoding: Claude's constrained output refuses a schema with more than
// 16 union-type fields or 24 optional ones ("exponential compilation cost", the provider's words). Such a schema goes in
// the instructions, and the caller's own checks judge the output. Shared by the Claude API adapter (src/lib/ai-anthropic.ts)
// and the OpenRouter adapter (src/lib/ai-openrouter.ts). Limits: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
// (read 2026-10-31), and the provider's refusal of 2026-11-05 (D-282).

export const UNION_LIMIT = 16;
export const OPTIONAL_LIMIT = 24;

/** The fields of a schema that count against the limits: an `anyOf`, a `oneOf` or a list of types; a property not required. */
export function schemaLoad(schema: unknown): { unions: number; optional: number } {
  let unions = 0;
  let optional = 0;
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== "object" || node === null) return;
    const o = node as Record<string, unknown>;
    if (Array.isArray(o.anyOf) || Array.isArray(o.oneOf) || Array.isArray(o.type)) unions++;
    if (typeof o.properties === "object" && o.properties !== null) {
      const required = new Set(Array.isArray(o.required) ? o.required : []);
      optional += Object.keys(o.properties).filter((name) => !required.has(name)).length;
    }
    Object.values(o).forEach(walk);
  };
  walk(schema);
  return { unions, optional };
}

/** Whether Claude's constrained decoding would refuse this schema, so that no request is spent to find out. */
export function overConstrainedLimit(schema: unknown): boolean {
  const { unions, optional } = schemaLoad(schema);
  return unions > UNION_LIMIT || optional > OPTIONAL_LIMIT;
}

/** The instructions for a request whose schema goes in the text. */
export const schemaInText = (system: string, schema: Record<string, unknown>) =>
  `${system}\n\nAnswer with one JSON object and nothing else: no code fence, no words before or after it. It must match this JSON Schema exactly: give every property, and use null only where the schema allows null.\n${JSON.stringify(schema)}`;

/** The first complete JSON object in the text, from its first "{" to the "}" that closes it (strings read whole). */
export function firstObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}
