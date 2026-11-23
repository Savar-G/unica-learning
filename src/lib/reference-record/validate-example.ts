import {
  EXAMPLE_MARK_KINDS,
  EXAMPLE_POSITIONS,
  EXAMPLE_RELATIONS,
  EXAMPLE_STEP_KINDS,
  ITEM_FORMS,
  NOT_STATED,
  UNCLEAR,
  type ValidationError,
} from "./types";
import {
  checkAllowedKeys,
  checkReaderEnum,
  checkReaderString,
  isNonEmptyString,
  isPlainObject,
  isPositiveInt,
  isSentinel,
  joinPath,
  pushError,
  validateExpr,
} from "./validate-parts";

function validateExampleSteps(
  v: unknown,
  path: string,
  errors: ValidationError[],
): Set<number> {
  const validStepNumbers = new Set<number>();
  if (isSentinel(v)) return validStepNumbers;
  if (!Array.isArray(v)) {
    pushError(errors, path, `must be a list of example steps, "${UNCLEAR}", or "${NOT_STATED}"`);
    return validStepNumbers;
  }

  v.forEach((step, idx) => {
    const sPath = `${path}[${idx}]`;
    if (!isPlainObject(step)) {
      pushError(errors, sPath, "must be an example step object");
      return;
    }
    checkAllowedKeys(step, ["n", "shows", "printed", "note", "shows_other"], sPath, errors);
    const expectedN = idx + 1;
    if (!isPositiveInt(step.n)) {
      pushError(errors, joinPath(sPath, "n"), "must be a positive integer");
    } else if (step.n !== expectedN) {
      pushError(
        errors,
        joinPath(sPath, "n"),
        `step number must start at 1 and rise by 1 (expected ${expectedN}, got ${step.n})`,
      );
    } else {
      validStepNumbers.add(step.n);
    }

    checkReaderEnum(step.shows, EXAMPLE_STEP_KINDS, joinPath(sPath, "shows"), errors);
    checkReaderString(step.printed, joinPath(sPath, "printed"), errors, true);
    if ("note" in step && step.note !== undefined) {
      checkReaderString(step.note, joinPath(sPath, "note"), errors, true);
    }

    if (step.shows === "other") {
      if (!isNonEmptyString(step.shows_other) || isSentinel(step.shows_other)) {
        pushError(
          errors,
          joinPath(sPath, "shows_other"),
          'shows_other is required and must be a non-empty string when shows is "other"',
        );
      }
    } else if ("shows_other" in step && step.shows_other !== undefined) {
      pushError(
        errors,
        joinPath(sPath, "shows_other"),
        'shows_other is only allowed when shows is "other"',
      );
    }
  });

  return validStepNumbers;
}

function validateExampleMarks(
  v: unknown,
  path: string,
  errors: ValidationError[],
  validStepNumbers: Set<number>,
): void {
  if (isSentinel(v)) return;
  if (!Array.isArray(v)) {
    pushError(errors, path, `must be a list of example marks, "${UNCLEAR}", or "${NOT_STATED}"`);
    return;
  }

  v.forEach((mark, idx) => {
    const mPath = `${path}[${idx}]`;
    if (!isPlainObject(mark)) {
      pushError(errors, mPath, "must be an example mark object");
      return;
    }
    checkAllowedKeys(mark, ["kind", "step", "description"], mPath, errors);
    checkReaderEnum(mark.kind, EXAMPLE_MARK_KINDS, joinPath(mPath, "kind"), errors);

    if ("step" in mark && mark.step !== undefined) {
      if (!isPositiveInt(mark.step)) {
        pushError(errors, joinPath(mPath, "step"), "must be a positive integer step number");
      } else if (!validStepNumbers.has(mark.step)) {
        pushError(
          errors,
          joinPath(mPath, "step"),
          `step ${mark.step} does not match any step in this example`,
        );
      }
    }

    if (mark.kind === "other") {
      if (!isNonEmptyString(mark.description) || isSentinel(mark.description)) {
        pushError(
          errors,
          joinPath(mPath, "description"),
          'description is required and must be a non-empty string when kind is "other"',
        );
      }
    } else if ("description" in mark && mark.description !== undefined) {
      checkReaderString(mark.description, joinPath(mPath, "description"), errors, true);
    }
  });
}

export function validateExample(v: unknown, path: string, errors: ValidationError[]): void {
  if (!isPlainObject(v)) {
    pushError(errors, path, "must be an example object");
    return;
  }
  checkAllowedKeys(
    v,
    ["position", "relation", "label", "parts", "steps", "marks", "text", "cross_ref"],
    path,
    errors,
  );
  checkReaderEnum(v.position, EXAMPLE_POSITIONS, joinPath(path, "position"), errors);
  checkReaderEnum(v.relation, EXAMPLE_RELATIONS, joinPath(path, "relation"), errors);
  if ("label" in v && v.label !== undefined) {
    checkReaderString(v.label, joinPath(path, "label"), errors, true);
  }
  if ("text" in v && v.text !== undefined) {
    checkReaderString(v.text, joinPath(path, "text"), errors, true);
  }
  if ("cross_ref" in v && v.cross_ref !== undefined) {
    checkReaderString(v.cross_ref, joinPath(path, "cross_ref"), errors, true);
  }
  if (!Array.isArray(v.parts) || v.parts.length === 0) {
    pushError(errors, joinPath(path, "parts"), "must be a non-empty list of example parts");
  } else {
    v.parts.forEach((part, i) => {
      const pPath = `${path}.parts[${i}]`;
      if (!isPlainObject(part)) {
        pushError(errors, pPath, "must be an example part object");
        return;
      }
      checkAllowedKeys(part, ["caption", "form", "expr", "shown_answer"], pPath, errors);
      if ("caption" in part && part.caption !== undefined) {
        checkReaderString(part.caption, joinPath(pPath, "caption"), errors, true);
      }
      checkReaderEnum(part.form, ITEM_FORMS, joinPath(pPath, "form"), errors);
      if (part.expr !== null) {
        validateExpr(part.expr, joinPath(pPath, "expr"), errors, true);
      }
      if ("shown_answer" in part && part.shown_answer !== undefined) {
        checkReaderString(part.shown_answer, joinPath(pPath, "shown_answer"), errors, true);
      }
    });
  }

  let validStepNumbers = new Set<number>();
  if ("steps" in v && v.steps !== undefined) {
    validStepNumbers = validateExampleSteps(v.steps, joinPath(path, "steps"), errors);
  }
  if ("marks" in v && v.marks !== undefined) {
    validateExampleMarks(v.marks, joinPath(path, "marks"), errors, validStepNumbers);
  }
}
