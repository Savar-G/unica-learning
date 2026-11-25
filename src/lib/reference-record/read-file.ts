import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";

const STRICT_UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export function decodeStrictUtf8(bytes: Uint8Array): string {
  return STRICT_UTF8_DECODER.decode(bytes);
}

export function parseStrictUtf8Json(bytes: Uint8Array): unknown {
  return JSON.parse(decodeStrictUtf8(bytes)) as unknown;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function readRegularFileNoFollow(filePath: string): Buffer {
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  // Without it, the open of a named pipe waits until another program writes to it.
  const nonBlock = typeof constants.O_NONBLOCK === "number" ? constants.O_NONBLOCK : 0;
  let fd: number;
  try {
    fd = openSync(filePath, constants.O_RDONLY | noFollow | nonBlock);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ELOOP") {
      throw new Error(`Refusing to read symlink: ${filePath}`);
    }
    throw err;
  }

  try {
    const st = fstatSync(fd);
    if (!st.isFile()) {
      throw new Error(`Refusing to read non-regular file: ${filePath}`);
    }
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

// Null only when no file is there. Every other error (a link, no permission) stays an error, so
// that a file that cannot be read never counts as a missing file.
export function readRegularFileIfExists(filePath: string): Buffer | null {
  try {
    return readRegularFileNoFollow(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

// The same, and the error names the file.
export function parseJsonFileBytes(filePath: string, bytes: Uint8Array): unknown {
  try {
    return parseStrictUtf8Json(bytes);
  } catch (err) {
    const kind = err instanceof SyntaxError ? "Invalid JSON" : "Invalid UTF-8";
    throw new Error(
      `Damaged file (${kind} in ${filePath}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// The one reader of a JSON note of a work folder (status.json, report.json, the digests, the photo
// list). Null only when no file is there. A link, a folder, or text that parse refuses is an error
// that names the file, so that a damaged note never counts as a missing one.
export function readJsonNote<T>(filePath: string, parse: (raw: unknown) => T): T | null {
  const bytes = readRegularFileIfExists(filePath);
  if (bytes === null) return null;
  const raw = parseJsonFileBytes(filePath, bytes);
  try {
    return parse(raw);
  } catch (err) {
    throw new Error(`Damaged file ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
