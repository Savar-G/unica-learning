// One scripted or typed Maya text session, from the first line to the written trace (#322, review R382-1): the loop
// behind `npm run maya:text` (scripts/maya-text-cli.ts), here so tests drive it. Whatever fails (reading the script,
// starting or closing LiveKit, the session itself), the call ends as a technical issue and the trace is written with
// its outcome.
import type { LivekitTextSession } from "@/lib/maya-livekit-text";
import type { TextOutput, TextSession } from "@/lib/maya-text";
import { redactText, type MayaTrace } from "@/lib/maya-trace";

export interface TextRun {
  text: TextSession;
  /** The child's lines. A function, so a failure to open them is a failure of this run. */
  lines: () => AsyncIterable<string>;
  /** LiveKit text mode around the session, or null for the adapter alone. */
  livekit: ((text: TextSession) => Promise<LivekitTextSession>) | null;
  /** Moves a simulated clock on by this many milliseconds (does nothing with the real clock). */
  advance: (ms: number) => void;
  /** Prints the child's lines too (a script or piped input; typed lines are already on screen). */
  echoChild: boolean;
  log: (line: string) => void;
  writeTrace: (trace: MayaTrace) => void;
}

/** Simulated time for each line. */
export const LINE_MS = 4_000;

const short = (e: unknown) => redactText((e instanceof Error ? e.message : String(e)).slice(0, 200));

/** Runs the session to its end and writes the trace. Returns the trace and the first error, if any. */
export async function runTextSession(run: TextRun): Promise<{ trace: MayaTrace; error: unknown }> {
  const { text, log } = run;
  const show = (out: TextOutput) => {
    for (const s of out.say) log(`Maya: ${s}`);
    for (const b of out.board) log(`  [board ${b.transactionId}] ${b.commands.map((c) => JSON.stringify(c)).join(" ")}`);
    if (out.ended) {
      log(`-- call ended: ${JSON.stringify(out.ended)}`);
      if (out.safetyMessage) log(`-- on screen: ${out.safetyMessage}`);
    }
  };

  let lk: LivekitTextSession | null = null;
  let error: unknown = null;
  try {
    lk = run.livekit ? await run.livekit(text) : null;
    show(lk ? (await lk.open()).output : await text.start());
    for await (const raw of run.lines()) {
      if (text.ended) break;
      const line = raw.replace(/#.*$/, "").trim();
      if (!line) continue;
      if (line === "/quit") break;
      run.advance(LINE_MS);
      const wait = /^\/wait\s+(\d+)$/.exec(line);
      const write = /^\/write\s+(start|done)$/.exec(line);
      if (wait) {
        run.advance(Number(wait[1]) * 1000);
        show(await text.tick());
      } else if (write) {
        show(await text.writing(write[1] === "start" ? "started" : "done"));
      } else {
        if (run.echoChild) log(`Child: ${line}`);
        show(lk ? (await lk.say(line)).output : await text.child(line));
      }
    }
  } catch (e) {
    error = e;
    log(`-- the run failed: ${short(e)}`);
  }
  try {
    await lk?.close();
  } catch (e) {
    error ??= e;
    log(`-- LiveKit did not close: ${short(e)}`);
  }
  const trace = await text.finish(error ? `the run failed: ${short(error)}` : "the input ended before the call ended");
  if (!error && trace.outcome?.reason === "technical_issue") log("-- call ended: the input ended first (technical_issue)");
  try {
    run.writeTrace(trace);
  } catch (e) {
    error ??= e;
    log(`-- the trace was not written: ${short(e)}`);
  }
  return { trace, error };
}
