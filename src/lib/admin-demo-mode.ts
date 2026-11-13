// The ?demo=1 view of the admin insight pages (D-331, D-332): made-up rows, no sign-in, for local review only. Pure, so
// a test can prove production ignores it. It is allowed only in a development build outside Vercel's production and
// preview environments; any other value of NODE_ENV or VERCEL_ENV turns it off.
export const DEMO_NOTE = "Demo data: made-up numbers for review. This is not the real site.";

export function demoAllowed(env: { NODE_ENV?: string; VERCEL_ENV?: string } = process.env): boolean {
  return env.NODE_ENV === "development" && env.VERCEL_ENV !== "production" && env.VERCEL_ENV !== "preview";
}

/** Whether this request shows the demo: the address asks for it and the environment allows it. */
export function demoRequested(query: { demo?: string | string[] }, env?: { NODE_ENV?: string; VERCEL_ENV?: string }): boolean {
  return query.demo === "1" && demoAllowed(env);
}
