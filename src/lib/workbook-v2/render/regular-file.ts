// Reads a file that must be a regular file: no folder, link or named pipe, which could hold other bytes or wait for ever.
import { constants, open } from "node:fs/promises";

/** The bytes, or null when there is no regular file at this path. */
export async function readRegularFile(path: string): Promise<Uint8Array | null> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(() => null);
  if (!file) return null;
  try {
    return (await file.stat()).isFile() ? await file.readFile() : null;
  } finally {
    await file.close();
  }
}
