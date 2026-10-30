// Paths that hold a private token (#301, review R349-3): a page's QR code is `/tutor/p/<token>`. Analytics and ad
// addresses keep the page but never the token. Pure TypeScript, no browser.

const QR_PAGE = /^(\/+tutor\/p\/)[^/]+/i;

/** `path` with a QR token replaced by "token"; any other path unchanged. Reads a percent-encoded path too. */
export function redactPathTokens(path: string): string {
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch {}
  return QR_PAGE.test(decoded) ? decoded.replace(QR_PAGE, "$1token") : path;
}

/** A full address with any QR token in its path replaced by "token" (review R349-4); a bare path works too. */
export function redactUrlTokens(url: string): string {
  try {
    const parsed = new URL(url);
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
  let parsed: URL;
  try { parsed = new URL(url, "https://unicalearning.com"); } catch { return true; }
  const decode = (v: string) => { let d = v; for (let i = 0; i < 3; i += 1) { try { const n = decodeURIComponent(d); if (n === d) break; d = n; } catch { break; } } return d; };
  if (/^\/+tutor(\/|$)/i.test(decode(parsed.pathname))) return true;
  for (const value of parsed.searchParams.values()) if (/\/+tutor\/+p\//i.test(decode(value))) return true;
  return /\/+tutor\/+p\//i.test(decode(parsed.hash));
}
