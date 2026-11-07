import {
  pacedTransport, sendEmailOnce,
  type DeliveryOutcome, type EmailCopy, type EmailMessage, type MailTransport,
  type SendLedger, type SendOptions, type SendResult,
} from "@/lib/email-delivery";

export interface ScanReminderClaimInput {
  readonly parentId: string;
  /** The complete due set from the store, not a selected subset. */
  readonly episodeIds: readonly string[];
  readonly unsubscribeHash: string;
}

export interface ScanReminderHandle extends ScanReminderClaimInput {
  readonly messageId: string;
  readonly attemptToken: string;
  readonly emailLogId: string;
  readonly attempt: number;
  readonly childIds: readonly string[];
}

/** Camel-case RPC boundary. Unknown responses must pass the checks below before dispatch. */
export interface ScanReminderSendStore {
  claim(input: ScanReminderClaimInput): Promise<unknown>;
  admit(handle: ScanReminderHandle): Promise<unknown>;
  /** Check all handle identities and the exact state. Never infer permission from a missing row. */
  current(handle: ScanReminderHandle, state: "reserved" | "admitted"): Promise<boolean>;
  /** Bind existing saveEmailCopy/copyRow to handle.parentId and handle.emailLogId. Preserve deletion guards. */
  keepCopy(handle: ScanReminderHandle, copy: EmailCopy): Promise<void>;
  /** SQL must compare the current token and admitted state again in this write. No retry on a lost reply. */
  finish(handle: ScanReminderHandle, outcome: SendResult): Promise<unknown>;
  /** SQL must compare the current token and reserved state again in this write. */
  release(handle: ScanReminderHandle): Promise<unknown>;
}

export type ScanReminderSendOutcome = DeliveryOutcome
  | { status: "not_sent"; reason: string; released: boolean };

export interface ScanReminderSendInput extends ScanReminderClaimInput {
  message: EmailMessage;
  /** Cancellation can release only a reservation whose admission has never been attempted. */
  signal?: AbortSignal;
}

const BLOCKED: SendResult = { status: "refused", error: "Scan reminder dispatch was not admitted" };
const STOPPED: SendResult = { status: "refused", error: "The send did not start: the time ran out" };
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const ids = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0
  && value.length <= 100 && value.every(uuid) && new Set(value).size === value.length;
const row = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

interface Binding {
  handle: ScanReminderHandle;
  phase: "reserved" | "admission-attempted" | "admitted" | "closed";
  reason: string;
  released: boolean;
  dispatched: boolean;
  outcome?: SendResult;
}

/** One factory per scheduler run. Give transport to ordinary sendEmailOnce callers too. No provider defaults. */
export function createWorkbookScanReminderSender({ store, transport: provider, gapMs }: {
  store: ScanReminderSendStore; transport: MailTransport; gapMs: number;
}): { transport: MailTransport; send(input: ScanReminderSendInput): Promise<ScanReminderSendOutcome> } {
  if (!Number.isFinite(gapMs) || gapMs < 0) throw new Error("Invalid email pacing gap");
  const bindings = new WeakMap<EmailMessage, Binding>();
  let lastRequestStart = -Infinity;

  // pacedTransport has one serial queue. Its timestamp precedes asynchronous admission. Correct the remaining
  // gap from the actual provider start inside that same queue, before admission, without delaying provider answers.
  async function waitForGap(signal?: AbortSignal): Promise<void> {
    for (let left = lastRequestStart + gapMs - performance.now(); left > 0;
      left = lastRequestStart + gapMs - performance.now()) {
      if (signal?.aborted) return;
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); signal?.removeEventListener("abort", done); resolve(); };
        const timer = setTimeout(done, left);
        signal?.addEventListener("abort", done, { once: true });
      });
    }
  }

  const transport = pacedTransport({
    async send(message, options) {
      await waitForGap(options?.signal);
      const binding = bindings.get(message);
      if (!binding) {
        if (options?.signal?.aborted || options?.mayStart?.() === false) return STOPPED;
        lastRequestStart = performance.now();
        return provider.send(message, options);
      }
      if (binding.phase !== "reserved" || options?.signal?.aborted) return BLOCKED;
      // Set this before awaiting the RPC. A throw, malformed answer or lost reply must never release this claim.
      binding.phase = "admission-attempted";
      binding.reason = "admission-unknown";
      let answer: Record<string, unknown>;
      try { answer = row(await store.admit(binding.handle)); } catch { return BLOCKED; }
      const handle = binding.handle;
      if (answer.status !== "admitted") {
        if (["busy", "stale", "unavailable", "not-due"].includes(String(answer.status))) {
          binding.reason = String(answer.status);
        }
        return BLOCKED;
      }
      if (answer.messageId !== handle.messageId || answer.attemptToken !== handle.attemptToken
        || answer.emailLogId !== handle.emailLogId || !ids(answer.episodeIds)
        || !sameSet(answer.episodeIds, handle.episodeIds)) return BLOCKED;
      binding.phase = "admitted";
      binding.dispatched = true;
      lastRequestStart = performance.now();
      // Admission is committed. Do not recheck cancellation or pass its signal to a request that is now admitted.
      return provider.send(message);
    },
  }, gapMs);

  return {
    transport,
    async send(input) {
      // Each invocation owns a different immutable object, even when callers reuse one message concurrently.
      const message: EmailMessage = Object.freeze({ ...input.message,
        sender: Object.freeze({ ...input.message.sender }),
        ...(input.message.headers ? { headers: Object.freeze({ ...input.message.headers }) } : {}),
      });
      const key: ScanReminderClaimInput = Object.freeze({ parentId: input.parentId,
        episodeIds: Object.freeze([...input.episodeIds]), unsubscribeHash: input.unsubscribeHash });
      const signal = input.signal;
      const notSent = (reason: string, released = false): ScanReminderSendOutcome => ({ status: "not_sent", reason, released });
      if (!uuid(key.parentId) || !ids(key.episodeIds) || !/^[0-9a-f]{64}$/.test(key.unsubscribeHash)
        || message.sender.to !== "parent") return notSent("invalid-input");
      if (signal?.aborted) return notSent("cancelled");
      let binding: Binding | undefined;
      let claimReason: string | undefined;
      const ledger: SendLedger<ScanReminderClaimInput, ScanReminderHandle> = {
        async claim(request, fields) {
          const answer = row(await store.claim({ ...request, unsubscribeHash: fields.unsubscribe_hash }));
          if (answer.status !== "claimed") {
            claimReason = ["busy", "set-changed", "refresh-required", "unsubscribed", "unavailable"].includes(String(answer.status))
              ? String(answer.status) : "claim-unknown";
            return null;
          }
          if (!uuid(answer.messageId) || !uuid(answer.attemptToken) || !uuid(answer.emailLogId)
            || !Number.isInteger(answer.attempt) || (answer.attempt as number) < 1 || (answer.attempt as number) > 3
            || !ids(answer.episodeIds) || !sameSet(answer.episodeIds, key.episodeIds) || !ids(answer.childIds)) {
            claimReason = "claim-unknown";
            return null;
          }
          const handle: ScanReminderHandle = Object.freeze({ ...key, messageId: answer.messageId,
            attemptToken: answer.attemptToken, emailLogId: answer.emailLogId, attempt: answer.attempt as number,
            childIds: Object.freeze([...answer.childIds]) });
          binding = { handle, phase: "reserved", reason: "cancelled", released: false, dispatched: false };
          bindings.set(message, binding);
          return handle;
        },
        async sent(_handle, emailId) { binding!.outcome = { status: "sent", emailId }; },
        async refused(_handle, error) { binding!.outcome = { status: "refused", error }; },
        async unknown(_handle, error) { binding!.outcome = { status: "unknown", error }; },
        async keepCopy(handle, _key, copy) {
          const held = binding!;
          if (held.phase === "reserved" && signal?.aborted) {
            if (await store.current(handle, "reserved") === true) {
              held.released = row(await store.release(handle)).status === "released";
            }
            held.phase = "closed";
            return;
          }
          if (held.phase !== "admitted" || !held.outcome || await store.current(handle, "admitted") !== true) return;
          try {
            await store.keepCopy(handle, Object.freeze({ ...copy }));
          } finally {
            // Copy errors do not turn a sent or unknown request into a refusal. SQL guards the token again.
            if (await store.current(handle, "admitted") === true) await store.finish(handle, held.outcome);
            held.phase = "closed";
          }
        },
      };
      let outcome: DeliveryOutcome;
      try {
        outcome = await sendEmailOnce(ledger, key, message, {
          claimFields: { unsubscribe_hash: key.unsubscribeHash },
          transport: { send: (bound, options?: SendOptions) => transport.send(bound, { ...options, signal }) },
        });
      } catch { return notSent("claim-unknown"); }
      if (claimReason) return claimReason === "busy" ? { status: "busy" } : notSent(claimReason);
      return binding?.dispatched ? outcome : notSent(binding?.reason ?? "claim-unknown", binding?.released);
    },
  };
}
