// The last check of a send (SendOptions.admit, src/lib/email-delivery.ts): asked by every transport right before the
// request, after any wait. No imports, so the delivery module and the Resend adapter can both use it.

/** The answer of a send whose `admit` said no. */
export const NOT_ADMITTED = { status: "refused", error: "The send did not start: the email may no longer go" } as const;

/** Whether `options.admit` lets the send start; none lets it, and a throw is a no. */
export const admitted = async (options?: { admit?(): Promise<boolean> }) =>
  !options?.admit || await options.admit().then((ok) => ok === true, () => false);
