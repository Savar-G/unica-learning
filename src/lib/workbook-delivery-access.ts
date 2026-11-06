/** The effective receipt must exist, name this child and book, and be no later than now. An estimate never enters this rule. */
export function confirmedWorkbookDelivery(
  receipts: readonly { childId: string; workbookId: string; deliveredAt: string }[],
  corrections: readonly { workbookId: string; deliveredAt: string; auditId: number }[],
  childId: string,
  workbookId: string,
  now: number,
): string | null {
  const receipt = receipts.find(r => r.childId === childId && r.workbookId === workbookId);
  if (!receipt || !Number.isFinite(now)) return null;
  const changes = corrections.filter(c => c.workbookId === workbookId);
  if (changes.some(c => !Number.isSafeInteger(c.auditId) || c.auditId < 1)) return null;
  const latest = changes.reduce<typeof changes[number] | null>((best, c) => !best || c.auditId > best.auditId ? c : best, null);
  const at = latest?.deliveredAt ?? receipt.deliveredAt;
  const time = Date.parse(at);
  return Number.isFinite(time) && time <= now ? at : null;
}
