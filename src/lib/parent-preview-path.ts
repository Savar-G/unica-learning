/** Keep synthetic Admin activity out of site analytics and ad tags, including after client navigation. */
export function isParentPreviewPath(value: string): boolean {
  try {
    const path = new URL(value, "https://unicalearning.com").pathname;
    return path === "/admin/parent-dashboard" || path.startsWith("/admin/parent-dashboard/");
  } catch { return false; }
}
