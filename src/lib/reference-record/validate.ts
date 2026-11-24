import {
  ITEM_FORMS,
  NOT_STATED,
  UNCLEAR,
  type ContentsRecord,
  type PageRecord,
  type ReferenceRecord,
  type ValidationError,
  type ValidationResult,
} from "./types";
import { validateExample } from "./validate-example";
import {
  checkAllowedKeys,
  checkIntRange,
  checkReaderEnum,
  checkReaderNumber,
  checkReaderString,
  isNonEmptyString,
  isPlainObject,
  isPositiveInt,
  isSentinel,
  joinPath,
  pushError,
  validateExpr,
  validateResponse,
  validateScaffold,
  validateScoreBands,
} from "./validate-parts";

const PAGE_SOURCE_REF_RE = /^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:\d+[a-z]$/;
const CONTENTS_SOURCE_REF_RE = /^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:contents$/;

function validateReaders(v: unknown, path: string, errors: ValidationError[]): void {
  if (!Array.isArray(v) || v.length === 0 || !v.every((r) => isNonEmptyString(r))) {
    pushError(errors, path, "must be a non-empty list of reader names");
  }
}

function validateSingleRead(v: unknown, path: string, errors: ValidationError[]): void {
  if (!Array.isArray(v) || v.length === 0 || !v.every((p) => isNonEmptyString(p))) {
    pushError(errors, path, "must be a non-empty list of field paths");
  }
}

function validatePageRecord(obj: Record<string, unknown>, errors: ValidationError[]): void {
  checkAllowedKeys(
    obj,
    ["kind", "source_ref", "topic", "sections", "examples", "score_bands", "readers", "single_read"],
    "",
    errors,
  );
  if (typeof obj.source_ref !== "string" || !PAGE_SOURCE_REF_RE.test(obj.source_ref)) {
    pushError(
      errors,
      "source_ref",
      "must match <source>:<level>:<sheet><side> (for example demo:Z:12a)",
    );
  }

  if (!isPlainObject(obj.topic)) {
    pushError(errors, "topic", "must be a topic object");
  } else {
    checkAllowedKeys(obj.topic, ["title", "number"], "topic", errors);
    checkReaderString(obj.topic.title, "topic.title", errors, true);
    if ("number" in obj.topic && obj.topic.number !== undefined) {
      checkReaderNumber(obj.topic.number, "topic.number", errors, {
        allowNull: true,
        positiveInt: true,
      });
    }
  }

  if (!Array.isArray(obj.sections) || obj.sections.length === 0) {
    pushError(errors, "sections", "must be a non-empty list of sections");
  } else {
    obj.sections.forEach((sec, si) => {
      const sPath = `sections[${si}]`;
      if (!isPlainObject(sec)) {
        pushError(errors, sPath, "must be a section object");
        return;
      }
      checkAllowedKeys(sec, ["instruction", "scaffolds", "items"], sPath, errors);
      checkReaderString(sec.instruction, joinPath(sPath, "instruction"), errors, true);

      let validItemNumbers: Set<number> | undefined;
      if (!Array.isArray(sec.items)) {
        pushError(errors, joinPath(sPath, "items"), "must be a list of items");
      } else {
        const seenN = new Set<number>();
        sec.items.forEach((item, ii) => {
          const iPath = `${sPath}.items[${ii}]`;
          if (!isPlainObject(item)) {
            pushError(errors, iPath, "must be an item object");
            return;
          }
          checkAllowedKeys(item, ["n", "printed", "form", "expr", "responses"], iPath, errors);
          if (!isPositiveInt(item.n)) {
            pushError(errors, joinPath(iPath, "n"), "must be a positive integer");
          } else if (seenN.has(item.n)) {
            pushError(errors, joinPath(iPath, "n"), `duplicate item number ${item.n} in section`);
          } else {
            seenN.add(item.n);
          }
          checkReaderString(item.printed, joinPath(iPath, "printed"), errors, false);
          if (item.expr !== null) {
            validateExpr(item.expr, joinPath(iPath, "expr"), errors, true);
          }
          checkReaderEnum(
            item.form,
            ITEM_FORMS,
            joinPath(iPath, "form"),
            errors,
            item.expr === null,
          );
          if (!Array.isArray(item.responses)) {
            pushError(errors, joinPath(iPath, "responses"), "must be a list of responses");
          } else if (item.responses.length === 0 && item.expr !== null) {
            pushError(
              errors,
              joinPath(iPath, "responses"),
              "must be a non-empty list of responses when expr is not null",
            );
          } else {
            item.responses.forEach((resp, ri) =>
              validateResponse(resp, `${iPath}.responses[${ri}]`, errors),
            );
          }
        });
        validItemNumbers = seenN;
      }

      if (!isSentinel(sec.scaffolds)) {
        if (!Array.isArray(sec.scaffolds)) {
          pushError(
            errors,
            joinPath(sPath, "scaffolds"),
            `must be a list of scaffolds, "${UNCLEAR}", or "${NOT_STATED}"`,
          );
        } else {
          sec.scaffolds.forEach((sc, sci) =>
            validateScaffold(sc, `${sPath}.scaffolds[${sci}]`, errors, validItemNumbers),
          );
        }
      }
    });
  }

  if (!isSentinel(obj.examples)) {
    if (!Array.isArray(obj.examples)) {
      pushError(
        errors,
        "examples",
        `must be a list of examples, "${UNCLEAR}", or "${NOT_STATED}"`,
      );
    } else {
      obj.examples.forEach((ex, i) => validateExample(ex, `examples[${i}]`, errors));
    }
  }

  validateScoreBands(obj.score_bands, "score_bands", errors);
  if ("readers" in obj && obj.readers !== undefined) {
    validateReaders(obj.readers, "readers", errors);
  }
  if ("single_read" in obj && obj.single_read !== undefined) {
    validateSingleRead(obj.single_read, "single_read", errors);
  }
}

function validateContentsRecord(obj: Record<string, unknown>, errors: ValidationError[]): void {
  checkAllowedKeys(obj, ["kind", "source_ref", "topics", "readers", "single_read"], "", errors);
  if (typeof obj.source_ref !== "string" || !CONTENTS_SOURCE_REF_RE.test(obj.source_ref)) {
    pushError(
      errors,
      "source_ref",
      "must match <source>:<level>:contents (for example demo:Z:contents)",
    );
  }
  if (!Array.isArray(obj.topics) || obj.topics.length === 0) {
    pushError(errors, "topics", "must be a non-empty list of topics");
  } else {
    let prevN = 0;
    obj.topics.forEach((topic, i) => {
      const tPath = `topics[${i}]`;
      if (!isPlainObject(topic)) {
        pushError(errors, tPath, "must be a topic object");
        return;
      }
      checkAllowedKeys(topic, ["n", "title", "sheets", "std_time_min"], tPath, errors);
      if (!isPositiveInt(topic.n)) {
        pushError(errors, joinPath(tPath, "n"), "must be a positive integer");
      } else if (topic.n <= prevN) {
        pushError(
          errors,
          joinPath(tPath, "n"),
          `topic number ${topic.n} must be strictly greater than previous (${prevN})`,
        );
      } else {
        prevN = topic.n;
      }
      checkReaderString(topic.title, joinPath(tPath, "title"), errors, false);
      checkIntRange(topic.sheets, joinPath(tPath, "sheets"), errors, true);
      checkIntRange(topic.std_time_min, joinPath(tPath, "std_time_min"), errors, true);
    });
  }
  if ("readers" in obj && obj.readers !== undefined) {
    validateReaders(obj.readers, "readers", errors);
  }
  if ("single_read" in obj && obj.single_read !== undefined) {
    validateSingleRead(obj.single_read, "single_read", errors);
  }
}

export function validateReferenceRecord(value: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  if (!isPlainObject(value)) {
    return { ok: false, errors: [{ path: "$", message: "record must be a plain object" }] };
  }
  if (value.kind === "page") {
    validatePageRecord(value, errors);
    return errors.length === 0
      ? { ok: true, record: value as unknown as PageRecord }
      : { ok: false, errors };
  }
  if (value.kind === "contents") {
    validateContentsRecord(value, errors);
    return errors.length === 0
      ? { ok: true, record: value as unknown as ContentsRecord }
      : { ok: false, errors };
  }
  return {
    ok: false,
    errors: [{ path: "kind", message: 'must be "page" or "contents"' }],
  };
}

export function isPageRecord(record: ReferenceRecord): record is PageRecord {
  return record.kind === "page";
}
