/** Keep synthetic Admin activity out of site analytics and ad tags, including after client navigation. */
export function isParentPreviewPath(value: string): boolean {
  try {
    const path = new URL(value, "https://unicalearning.com").pathname;
    return ["/admin/dashboard", "/admin/parent-dashboard"].some(base => path === base || path.startsWith(`${base}/`));
  } catch { return false; }
}
