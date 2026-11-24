import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";

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
