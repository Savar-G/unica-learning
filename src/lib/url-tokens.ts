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
    const path = redactPathTokens(parsed.pathname);
    if (path === parsed.pathname) return url;
    parsed.pathname = path;
    return parsed.toString();
  } catch {
    return redactPathTokens(url);
  }
}
