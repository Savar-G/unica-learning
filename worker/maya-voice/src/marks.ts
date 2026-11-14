// Clock times of one voice turn, for the worker log (the latency deep dive, 2026-11-13). One job process serves one
// call, so one set of marks per process is one call's. Each name keeps its FIRST time since the last `takeMarks`, as
// milliseconds on the system clock; `takeMarks` returns them with each time also as milliseconds after the earliest.
// Names: detectorEnd (our detector's end of speech), sttFinal (the final transcript reached the worker), turnHeard
// (LiveKit gave the turn to the worker), modelSent (first request to the model provider), modelHeaders (its response
// started), modelFirstChunk (its first body bytes: the first token), ttsRequest (first words given to the voice),
// ttsFirstFrame (the voice's first audio frame), firstFramePublished (the session started to play audio).
const marks = new Map<string, number>();

export function mark(name: string, at = Date.now()): void {
  if (!marks.has(name)) marks.set(name, at);
}

/** A later time replaces an earlier one (the last end of speech before the final transcript is the child's). */
export function markLast(name: string, at = Date.now()): void {
  marks.set(name, at);
}

/** A new turn starts: marks left by speech between turns (the opening, a check-in) are dropped. */
export function resetMarks(): void {
  marks.clear();
}

export function takeMarks(): Record<string, number> | null {
  if (!marks.size) return null;
  const first = Math.min(...marks.values());
  const out: Record<string, number> = { t0: first };
  for (const [name, at] of [...marks].sort((a, b) => a[1] - b[1])) out[name] = at - first;
  marks.clear();
  return out;
}

/** Wraps fetch so requests to the model provider leave marks. It changes nothing in the request or the response. */
export function markedFetch(inner: typeof fetch, host = "openrouter.ai"): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes(host)) return inner(input, init);
    mark("modelSent");
    const response = await inner(input, init);
    mark("modelHeaders");
    if (!response.body) return response;
    let seen = false;
    const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (!seen) { seen = true; mark("modelFirstChunk"); }
        controller.enqueue(chunk);
      },
    }));
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}
