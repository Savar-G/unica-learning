// The request the Sentry tunnel forwards (src/app/sentry-tunnel/route.ts, docs/sentry.md): the body and only these
// headers. Sentry's handler would forward the visitor's IP address and the Referer, which on the desk holds a QR token.
const KEEP = ["content-type", "content-length", "user-agent"];

/** The request with its body and the KEEP headers only. */
export function bareRequest(request: Request): Request {
  const headers = new Headers();
  for (const name of KEEP) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Request(request.url, { method: "POST", headers, body: request.body, duplex: "half" } as RequestInit);
}
