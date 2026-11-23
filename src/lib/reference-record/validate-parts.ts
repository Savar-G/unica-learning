import {
  ANSWER_SOURCES,
  ARITH_OPS,
  NOT_STATED,
  RESPONSE_POSITIONS,
  SCAFFOLD_KINDS,
  UNCLEAR,
  type ValidationError,
} from "./types";

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isSentinel(v: unknown): v is typeof UNCLEAR | typeof NOT_STATED {
  return v === UNCLEAR || v === NOT_STATED;
}

export function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1;
}

export function isNonNegInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function joinPath(base: string, key: string): string {
  return base ? `${base}.${key}` : key;
}

export function pushError(errors: ValidationError[], path: string, message: string): void {
  errors.push({ path: path || "$", message });
}

export function checkAllowedKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: ValidationError[],
): void {
  const set = new Set(allowed);
  for (const key of Object.keys(obj)) {
    if (!set.has(key)) {
      pushError(errors, joinPath(path, key), `unknown field "${key}" is not allowed`);
    }
  }
}

export function checkReaderEnum<T extends string>(
  v: unknown,
  allowed: readonly T[],
  path: string,
  errors: ValidationError[],
  allowNull = false,
): void {
  if (allowNull && v === null) return;
  if (isSentinel(v)) return;
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) return;
  const opts = [...allowed, UNCLEAR, NOT_STATED, ...(allowNull ? ["null"] : [])].join(", ");
  pushError(errors, path, `must be one of ${opts}`);
}

export function checkReaderString(
  v: unknown,
  path: string,
  errors: ValidationError[],
  allowNull: boolean,
): void {
  if (allowNull && v === null) return;
  if (isSentinel(v)) return;
  if (isNonEmptyString(v)) return;
  pushError(
    errors,
    path,
    allowNull
      ? `must be a non-empty string, null, "${UNCLEAR}", or "${NOT_STATED}"`
      : `must be a non-empty string, "${UNCLEAR}", or "${NOT_STATED}"`,
  );
}

export function checkReaderNumber(
  v: unknown,
  path: string,
  errors: ValidationError[],
  opts: { allowNull?: boolean; positiveInt?: boolean } = {},
): void {
  if (opts.allowNull && v === null) return;
  if (isSentinel(v)) return;
  if (opts.positiveInt ? isPositiveInt(v) : isFiniteNumber(v)) return;
  pushError(
    errors,
    path,
    `must be a ${opts.positiveInt ? "positive integer" : "finite number"}${opts.allowNull ? ", null" : ""}, "${UNCLEAR}", or "${NOT_STATED}"`,
  );
}

export function checkIntRange(
  v: unknown,
  path: string,
  errors: ValidationError[],
  allowNull: boolean,
): void {
  if (allowNull && v === null) return;
  if (isSentinel(v)) return;
  if (
    Array.isArray(v) &&
    v.length === 2 &&
    isPositiveInt(v[0]) &&
    isPositiveInt(v[1]) &&
    v[0] <= v[1]
  ) {
    return;
  }
  pushError(
    errors,
    path,
    `must be a [min, max] range of positive integers with min <= max${allowNull ? ", null" : ""}, "${UNCLEAR}", or "${NOT_STATED}"`,
  );
}

export function validateExpr(
  v: unknown,
  path: string,
  errors: ValidationError[],
  allowLinked: boolean,
): void {
  if (!isPlainObject(v)) {
    pushError(errors, path, "must be an expression object");
    return;
  }
  const kind = v.kind;
  if (typeof kind !== "string") {
    pushError(errors, joinPath(path, "kind"), "must be an expression kind string");
    return;
  }
  if (kind === "linked") {
    if (!allowLinked) {
      pushError(errors, joinPath(path, "kind"), "nested linked expressions are not allowed");
      return;
    }
    checkAllowedKeys(v, ["kind", "pair", "connector"], path, errors);
    if (!Array.isArray(v.pair) || v.pair.length !== 2) {
      pushError(errors, joinPath(path, "pair"), "must be a pair of exactly 2 expressions");
    } else {
      validateExpr(v.pair[0], `${path}.pair[0]`, errors, false);
      validateExpr(v.pair[1], `${path}.pair[1]`, errors, false);
    }
    if ("connector" in v && v.connector !== undefined) {
      checkReaderString(v.connector, joinPath(path, "connector"), errors, true);
    }
    return;
  }

  switch (kind) {
    case "arith": {
      checkAllowedKeys(v, ["kind", "op", "operands"], path, errors);
      checkReaderEnum(v.op, ARITH_OPS, joinPath(path, "op"), errors);
      if (!Array.isArray(v.operands) || v.operands.length < 2) {
        pushError(errors, joinPath(path, "operands"), "must be a list of at least 2 operands");
      } else {
        if (v.op === "div" && v.operands.length !== 2) {
          pushError(errors, joinPath(path, "operands"), "division must have exactly 2 operands");
        }
        v.operands.forEach((opVal, i) =>
          checkReaderNumber(opVal, `${path}.operands[${i}]`, errors),
        );
      }
      return;
    }
    case "chain": {
      checkAllowedKeys(v, ["kind", "terms", "step"], path, errors);
      if (!Array.isArray(v.terms) || v.terms.length < 2) {
        pushError(errors, joinPath(path, "terms"), "must be a list of at least 2 terms");
      } else {
        let blankCount = 0;
        let knownCount = 0;
        v.terms.forEach((term, i) => {
          if (term === null) blankCount += 1;
          else knownCount += 1;
          checkReaderNumber(term, `${path}.terms[${i}]`, errors, { allowNull: true });
        });
        if (blankCount === 0) {
          pushError(
            errors,
            joinPath(path, "terms"),
            "chain must contain at least one blank (null)",
          );
        }
        if (knownCount === 0) {
          pushError(
            errors,
            joinPath(path, "terms"),
            "chain must contain at least one printed term",
          );
        }
      }
      if ("step" in v && v.step !== undefined) {
        checkReaderNumber(v.step, joinPath(path, "step"), errors);
      }
      return;
    }
    case "missing": {
      checkAllowedKeys(v, ["kind", "op", "operands", "result"], path, errors);
      checkReaderEnum(v.op, ARITH_OPS, joinPath(path, "op"), errors);
      let blankCount = 0;
      if (!Array.isArray(v.operands) || v.operands.length < 2) {
        pushError(errors, joinPath(path, "operands"), "must be a list of at least 2 operands");
      } else {
        v.operands.forEach((opVal, i) => {
          if (opVal === null) blankCount += 1;
          checkReaderNumber(opVal, `${path}.operands[${i}]`, errors, { allowNull: true });
        });
      }
      if (v.result === null) blankCount += 1;
      checkReaderNumber(v.result, joinPath(path, "result"), errors, { allowNull: true });
      if (blankCount === 0) {
        pushError(errors, path, "missing expression must contain at least one blank (null)");
      }
      return;
    }
    case "word": {
      checkAllowedKeys(v, ["kind", "text", "expr", "unit"], path, errors);
      checkReaderString(v.text, joinPath(path, "text"), errors, false);
      if (v.expr !== null && !isSentinel(v.expr)) {
        validateExpr(v.expr, joinPath(path, "expr"), errors, false);
      }
      if ("unit" in v && v.unit !== undefined) {
        checkReaderString(v.unit, joinPath(path, "unit"), errors, true);
      }
      return;
    }
    case "notation": {
      checkAllowedKeys(v, ["kind", "latex", "figure"], path, errors);
      checkReaderString(v.latex, joinPath(path, "latex"), errors, false);
      if ("figure" in v && v.figure !== undefined) {
        checkReaderString(v.figure, joinPath(path, "figure"), errors, true);
      }
      return;
    }
    default:
      pushError(
        errors,
        joinPath(path, "kind"),
        `unknown expr kind "${kind}" (expected arith, chain, missing, linked, word, or notation)`,
      );
  }
}

export function validateResponse(v: unknown, path: string, errors: ValidationError[]): void {
  if (!isPlainObject(v)) {
    pushError(errors, path, "must be a response object");
    return;
  }
  checkAllowedKeys(
    v,
    ["position", "cue", "answer", "answer_source", "unit", "place"],
    path,
    errors,
  );
  checkReaderEnum(v.position, RESPONSE_POSITIONS, joinPath(path, "position"), errors);
  checkReaderString(v.cue, joinPath(path, "cue"), errors, true);
  checkReaderString(v.answer, joinPath(path, "answer"), errors, true);

  if (
    typeof v.answer_source !== "string" ||
    !(ANSWER_SOURCES as readonly string[]).includes(v.answer_source)
  ) {
    pushError(
      errors,
      joinPath(path, "answer_source"),
      `must be one of ${ANSWER_SOURCES.join(", ")}`,
    );
  } else if (v.answer_source === "computed") {
    if (!isNonEmptyString(v.answer) || isSentinel(v.answer)) {
      pushError(
        errors,
        joinPath(path, "answer"),
        'must be a concrete non-empty string when answer_source is "computed"',
      );
    }
  }

  if (v.position === "line_with_unit") {
    if (!("unit" in v) || v.unit === undefined || v.unit === null) {
      pushError(
        errors,
        joinPath(path, "unit"),
        'unit is required when position is "line_with_unit"',
      );
    } else {
      checkReaderString(v.unit, joinPath(path, "unit"), errors, false);
    }
  } else if ("unit" in v && v.unit !== undefined) {
    checkReaderString(v.unit, joinPath(path, "unit"), errors, true);
  }

  if ("place" in v && v.place !== undefined) {
    checkReaderString(v.place, joinPath(path, "place"), errors, true);
  }
}

function checkAppliesTo(
  v: unknown,
  path: string,
  errors: ValidationError[],
  validItemNumbers?: Set<number>,
): void {
  if (v === "all" || isSentinel(v)) return;
  if (Array.isArray(v) && v.length > 0 && v.every((x) => isPositiveInt(x))) {
    if (validItemNumbers) {
      v.forEach((n, idx) => {
        if (!validItemNumbers.has(n)) {
          pushError(errors, `${path}[${idx}]`, `item number ${n} does not exist in this section`);
        }
      });
    }
    return;
  }
  pushError(
    errors,
    path,
    `must be a non-empty list of positive item numbers, "all", "${UNCLEAR}", or "${NOT_STATED}"`,
  );
}

export function validateScaffold(
  v: unknown,
  path: string,
  errors: ValidationError[],
  validItemNumbers?: Set<number>,
): void {
  if (!isPlainObject(v)) {
    pushError(errors, path, "must be a scaffold object");
    return;
  }
  const kind = v.kind;
  if (typeof kind !== "string" || !(SCAFFOLD_KINDS as readonly string[]).includes(kind)) {
    pushError(errors, joinPath(path, "kind"), `must be one of ${SCAFFOLD_KINDS.join(", ")}`);
    return;
  }
  checkAppliesTo(v.applies_to, joinPath(path, "applies_to"), errors, validItemNumbers);

  switch (kind) {
    case "answer_boxes": {
      checkAllowedKeys(v, ["kind", "applies_to", "box_count", "places"], path, errors);
      if ("box_count" in v && v.box_count !== undefined) {
        checkReaderNumber(v.box_count, joinPath(path, "box_count"), errors, { positiveInt: true });
      }
      if ("places" in v && v.places !== undefined && !isSentinel(v.places)) {
        if (!Array.isArray(v.places) || v.places.length === 0) {
          pushError(errors, joinPath(path, "places"), "must be a non-empty list of place names");
        } else {
          v.places.forEach((p, i) =>
            checkReaderString(p, `${path}.places[${i}]`, errors, false),
          );
        }
      }
      return;
    }
    case "number_strip": {
      checkAllowedKeys(v, ["kind", "applies_to", "values", "highlighted"], path, errors);
      if (!isSentinel(v.values)) {
        if (!Array.isArray(v.values) || v.values.length < 2) {
          pushError(errors, joinPath(path, "values"), "must be a list of at least 2 numbers");
        } else {
          v.values.forEach((n, i) => checkReaderNumber(n, `${path}.values[${i}]`, errors));
        }
      }
      if (
        "highlighted" in v &&
        v.highlighted !== undefined &&
        v.highlighted !== null &&
        !isSentinel(v.highlighted)
      ) {
        if (!Array.isArray(v.highlighted)) {
          pushError(
            errors,
            joinPath(path, "highlighted"),
            "must be a list of numbers, null, or sentinel",
          );
        } else {
          v.highlighted.forEach((n, i) => checkReaderNumber(n, `${path}.highlighted[${i}]`, errors));
        }
      }
      return;
    }
    case "table_read_aloud": {
      checkAllowedKeys(v, ["kind", "applies_to", "has_checkbox", "caption_style"], path, errors);
      if ("has_checkbox" in v && v.has_checkbox !== undefined) {
        if (typeof v.has_checkbox !== "boolean" && !isSentinel(v.has_checkbox)) {
          pushError(
            errors,
            joinPath(path, "has_checkbox"),
            `must be a boolean, "${UNCLEAR}", or "${NOT_STATED}"`,
          );
        }
      }
      if ("caption_style" in v && v.caption_style !== undefined) {
        checkReaderString(v.caption_style, joinPath(path, "caption_style"), errors, true);
      }
      return;
    }
    case "equation_frame": {
      checkAllowedKeys(v, ["kind", "applies_to", "template"], path, errors);
      checkReaderString(v.template, joinPath(path, "template"), errors, false);
      return;
    }
    case "arrow": {
      checkAllowedKeys(v, ["kind", "applies_to", "from", "to", "label"], path, errors);
      if ("from" in v && v.from !== undefined) {
        checkReaderString(v.from, joinPath(path, "from"), errors, true);
      }
      if ("to" in v && v.to !== undefined) {
        checkReaderString(v.to, joinPath(path, "to"), errors, true);
      }
      if ("label" in v && v.label !== undefined) {
        checkReaderString(v.label, joinPath(path, "label"), errors, true);
      }
      return;
    }
    case "caption": {
      checkAllowedKeys(v, ["kind", "applies_to", "text", "target"], path, errors);
      checkReaderString(v.text, joinPath(path, "text"), errors, false);
      if ("target" in v && v.target !== undefined) {
        checkReaderString(v.target, joinPath(path, "target"), errors, true);
      }
      return;
    }
    case "helper_digit":
    case "partial_working":
    case "worked_item": {
      checkAllowedKeys(v, ["kind", "applies_to", "description"], path, errors);
      if ("description" in v && v.description !== undefined) {
        checkReaderString(v.description, joinPath(path, "description"), errors, true);
      }
      return;
    }
    case "other": {
      checkAllowedKeys(v, ["kind", "applies_to", "description"], path, errors);
      if (!isNonEmptyString(v.description) || isSentinel(v.description)) {
        pushError(
          errors,
          joinPath(path, "description"),
          'description is required and must be a non-empty string when kind is "other"',
        );
      }
      return;
    }
  }
}

export function validateScoreBands(v: unknown, path: string, errors: ValidationError[]): void {
  if (isSentinel(v)) return;
  if (!Array.isArray(v) || v.length !== 5) {
    pushError(errors, path, "must have exactly 5 entries");
    return;
  }
  v.forEach((band, i) => {
    const bPath = `${path}[${i}]`;
    if (band === null || isSentinel(band)) return;
    if (!Array.isArray(band) || band.length !== 2) {
      pushError(errors, bPath, 'must be [min, max], [min, "open"], null, or sentinel');
      return;
    }
    const [low, high] = band;
    const lowIsSentinel = isSentinel(low);
    const highIsSentinel = isSentinel(high);
    if (!lowIsSentinel && !isNonNegInt(low)) {
      pushError(
        errors,
        `${bPath}[0]`,
        `must be a non-negative integer, "${UNCLEAR}", or "${NOT_STATED}"`,
      );
    }
    if (high === "open" || highIsSentinel) return;
    if (!isNonNegInt(high)) {
      pushError(
        errors,
        `${bPath}[1]`,
        `must be "open", a non-negative integer, "${UNCLEAR}", or "${NOT_STATED}"`,
      );
      return;
    }
    if (!lowIsSentinel && isNonNegInt(low) && high < low) {
      pushError(errors, `${bPath}[1]`, 'must be "open" or an integer >= lower bound');
    }
  });
}
