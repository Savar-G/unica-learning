/** Bound both memory use and the time spent waiting for an authenticated activity request. */
export class ActivityBodyError extends Error {
  constructor(readonly status: number) { super("Activity request body unavailable"); }
}

export async function activityJson(request: Request, maxBytes: number, timeoutMs = 2000): Promise<unknown> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new ActivityBodyError(413);
  if (!request.body) throw new ActivityBodyError(400);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ActivityBodyError(408)), timeoutMs);
  });
  try {
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new ActivityBodyError(413);
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
