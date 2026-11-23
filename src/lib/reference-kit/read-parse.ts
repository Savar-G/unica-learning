import {
  NOT_STATED,
  UNCLEAR,
  validateReferenceRecord,
  type ReferenceRecord,
  type ValidationError,
} from "@/lib/reference-record";
import { KIT_REF_SEGMENT_RE } from "./answers";
import { REFERENCE_READ_PROMPT } from "./read-prompt";

function extractTopLevelBalancedObjects(text: string): string[] {
  const results: string[] = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("{", i);
    if (start === -1) break;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let matchedEnd = -1;
    for (let j = start; j < text.length; j += 1) {
      const ch = text[j];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          matchedEnd = j;
          break;
        }
      }
    }
    if (matchedEnd !== -1) {
      results.push(text.slice(start, matchedEnd + 1));
      i = matchedEnd + 1;
    } else {
      i = start + 1;
    }
  }
  return results;
}

function tryParsePlainObject(candidate: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function extractJsonFromModelOutput(
  raw: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Model returned empty output" };
  }

  const balanced = extractTopLevelBalancedObjects(trimmed);

  // Among balanced top-level JSON objects, take the LAST one whose kind is "page" or "contents".
  let fallbackObject: Record<string, unknown> | null = null;
  for (let i = balanced.length - 1; i >= 0; i -= 1) {
    const parsed = tryParsePlainObject(balanced[i]);
    if (!parsed) continue;
    if (parsed.kind === "page" || parsed.kind === "contents") {
      return { ok: true, value: parsed };
    }
    if (!fallbackObject) {
      fallbackObject = parsed;
    }
  }

  if (fallbackObject) {
    return { ok: true, value: fallbackObject };
  }

  return { ok: false, error: "Could not extract a valid JSON object from model output" };
}

// topic.title is the full printed title with any number at its end. A reader that still splits
// off a positive integer number gets it put back at the end of the title, and topic.number is
// dropped. A null or sentinel number is left as it is.
function foldTopicNumber(obj: Record<string, unknown>): void {
  const topic = obj.topic;
  if (typeof topic !== "object" || topic === null || Array.isArray(topic)) return;
  const { number, ...rest } = topic as Record<string, unknown>;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1) return;
  const title = rest.title;
  if (title === null || title === undefined || (typeof title === "string" && !title.trim())) {
    rest.title = String(number);
  } else if (typeof title === "string" && title !== UNCLEAR && title !== NOT_STATED) {
    const tokens = title.trim().split(/\s+/);
    // The number is already there as the last token, or in round brackets at the end (with or
    // without a space before the brackets).
    const last = tokens[tokens.length - 1];
    const present = last === String(number) || title.trim().endsWith(`(${number})`);
    if (!present) rest.title = `${title.trim()} ${number}`;
  }
  obj.topic = rest;
}

export function assembleCandidateRecord(
  parsed: unknown,
  sourceKey: string,
  readerLabel: string,
): { candidate: unknown; extraErrors: ValidationError[] } {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      candidate: parsed,
      extraErrors: [{ path: "$", message: "output must be a JSON object" }],
    };
  }
  const obj: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
  const extraErrors: ValidationError[] = [];

  const hasLevel = "level" in obj && obj.level !== undefined;
  const hasSheet = "sheet" in obj && obj.sheet !== undefined;

  if (hasLevel || hasSheet) {
    // The level is stored in upper case: "m" and "M" are one level, and file names must not differ
    // only in letter case.
    // The characters are checked before the change of case ("ß" would become "SS").
    const rawLevel = typeof obj.level === "string" ? obj.level.trim() : "";
    const level = KIT_REF_SEGMENT_RE.test(rawLevel) ? rawLevel.toUpperCase() : rawLevel;
    const sheet = typeof obj.sheet === "string" ? obj.sheet.trim() : "";
    delete obj.level;
    delete obj.sheet;
    if (!level) {
      extraErrors.push({ path: "level", message: 'must be a non-empty string matching ^[A-Za-z0-9]+$' });
    } else if (!KIT_REF_SEGMENT_RE.test(level)) {
      extraErrors.push({
        path: "level",
        message: `invalid level "${level}": must contain letters and digits only (^[A-Za-z0-9]+$)`,
      });
    }
    if (!sheet) {
      extraErrors.push({ path: "sheet", message: 'must be a non-empty string matching ^[A-Za-z0-9]+$' });
    } else if (!KIT_REF_SEGMENT_RE.test(sheet)) {
      extraErrors.push({
        path: "sheet",
        message: `invalid sheet "${sheet}": must contain letters and digits only (^[A-Za-z0-9]+$)`,
      });
    }
    if (level && sheet) {
      obj.source_ref = `${sourceKey}:${level}:${sheet}`;
    }
  } else if (typeof obj.source_ref === "string") {
    const parts = obj.source_ref.split(":");
    if (parts.length !== 3 || parts[0] !== sourceKey) {
      extraErrors.push({
        path: "source_ref",
        message: `source_ref must match "${sourceKey}:<level>:<sheet>"`,
      });
    } else if (!parts.every((part) => KIT_REF_SEGMENT_RE.test(part))) {
      extraErrors.push({
        path: "source_ref",
        message: "source, level, and sheet in source_ref must each match ^[A-Za-z0-9]+$",
      });
    } else {
      // Same rule as above: the level of a page id is stored in upper case.
      obj.source_ref = `${parts[0]}:${parts[1].toUpperCase()}:${parts[2]}`;
    }
  }

  if (obj.kind === "page") foldTopicNumber(obj);
  obj.readers = [readerLabel];
  return { candidate: obj, extraErrors };
}

export function findNotStatedErrors(value: unknown, startPath = ""): ValidationError[] {
  const errors: ValidationError[] = [];
  const walk = (node: unknown, curPath: string): void => {
    if (node === NOT_STATED) {
      const displayPath = curPath || "$";
      errors.push({
        path: displayPath,
        message: `readers must not write not_stated at ${displayPath}`,
      });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, idx) => walk(item, `${curPath}[${idx}]`));
      return;
    }
    if (typeof node === "object" && node !== null) {
      for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
        const nextPath = curPath ? `${curPath}.${key}` : key;
        walk(val, nextPath);
      }
    }
  };
  walk(value, startPath);
  return errors;
}

export function validateModelAnswer(
  raw: string,
  sourceKey: string,
  readerLabel: string,
): { ok: true; record: ReferenceRecord } | { ok: false; errors: ValidationError[] } {
  const extracted = extractJsonFromModelOutput(raw);
  if (!extracted.ok) {
    return { ok: false, errors: [{ path: "$", message: extracted.error }] };
  }
  const { candidate, extraErrors } = assembleCandidateRecord(
    extracted.value,
    sourceKey,
    readerLabel,
  );
  const check = validateReferenceRecord(candidate);
  const allErrors = [...extraErrors, ...(check.ok ? [] : check.errors)];
  if (allErrors.length > 0 || !check.ok) {
    return { ok: false, errors: allErrors };
  }
  const notStatedErrors = findNotStatedErrors(check.record);
  if (notStatedErrors.length > 0) {
    return { ok: false, errors: notStatedErrors };
  }
  return { ok: true, record: check.record };
}

export function buildRetryPrompt(errors: ValidationError[]): string {
  const formatted = errors.map((e) => `- ${e.path}: ${e.message}`).join("\n");
  return [
    REFERENCE_READ_PROMPT,
    "",
    "Your previous JSON output failed validation with these errors. Fix them and output one valid JSON object only:",
    formatted,
  ].join("\n");
}
