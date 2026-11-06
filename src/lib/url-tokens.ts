// Paths that hold a private token (#301, review R349-3): a page's QR code is `/tutor/p/<token>`. Analytics and ad
// addresses keep the page but never the token. Pure TypeScript, no browser.

/** Decode nested redirects without leaving an encoded private route for another tracker. */
export function decodedRoute(value: string): string {
  let out = value.replace(/\\\//g, "/").replace(/\\/g, "/");
  for (let i = 0; i < 8; i++) { try { const next = decodeURIComponent(out); if (next === out) return out; out = next; } catch { return out; } }
  return /%[0-9a-f]{2}/i.test(out) ? "/admin" : out;
}
export function scanRoute(value: string): boolean { return /\/(?:account\/+scan|api\/+account\/+scans)(?=\/|[?#\s"']|$)/i.test(decodedRoute(value)); }
export function adminRoute(value: string): boolean { return /\/(?:api\/+)?admin(?=\/|[?#\s"']|$)/i.test(decodedRoute(value)); }
const QR_PAGE = /^(\/+tutor\/p\/)[^/]+/i;

/** `path` with a QR token replaced by "token"; any other path unchanged. Reads a percent-encoded path too. */
export function redactPathTokens(path: string): string {
  const decoded = decodedRoute(path);
  if (scanRoute(decoded)) return "/account/scan";
  if (adminRoute(decoded)) return "/admin";
  return QR_PAGE.test(decoded) ? decoded.replace(QR_PAGE, "$1token") : path;
}

/** A full address with any QR token in its path replaced by "token" (review R349-4); a bare path works too. */
export function redactUrlTokens(url: string): string {
  try {
    const parsed = new URL(url);
    if (scanRoute(url) || adminRoute(url)) return parsed.origin + redactPathTokens(decodedRoute(url).replace(parsed.origin, ""));
    let changed = false;
    const path = redactPathTokens(parsed.pathname);
    if (path !== parsed.pathname) { parsed.pathname = path; changed = true; }
    // A query value can hold a QR page too, for example the sign-in page's `next=/tutor/p/<token>` (review R349-4).
    for (const [key, value] of [...parsed.searchParams.entries()]) {
      const clean = redactPathTokens(value);
      if (clean !== value) { parsed.searchParams.set(key, clean); changed = true; }
    }
    return changed ? parsed.toString() : url;
  } catch {
    return redactPathTokens(url);
  }
}

/**
 * True when an address could carry a QR token anywhere: a /tutor path (the desk and its QR pages), or a query value
 * that holds one (for example the sign-in page's `next=/tutor/p/<token>`). Encoded forms are read too (review R349-5).
 */
export function mayCarryQrToken(url: string): boolean {
  if (scanRoute(url) || adminRoute(url)) return true;
  let parsed: URL;
  try { parsed = new URL(url, "https://unicalearning.com"); } catch { return true; }
  const decode = (v: string) => { let d = v; for (let i = 0; i < 3; i += 1) { try { const n = decodeURIComponent(d); if (n === d) break; d = n; } catch { break; } } return d; };
  if (/^\/+tutor(\/|$)/i.test(decode(parsed.pathname)) || /^\/(?:account\/scan|api\/account\/scans)(\/|$)/i.test(decode(parsed.pathname))) return true;
  for (const value of parsed.searchParams.values()) if (/\/+tutor\/+p\//i.test(decode(value))) return true;
  return /\/+tutor\/+p\//i.test(decode(parsed.hash));
}
