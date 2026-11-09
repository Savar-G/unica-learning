import type { ReviewComment } from "@/lib/workbook-edit";
import type { ReviewSend, ReviewVersion } from "@/lib/admin-store";
import { NEEDS_A_LOOK, plainReason } from "@/lib/workbook-reason";
import { workbookCommentRoute, type CommentPage } from "@/lib/workbook-comment-route";

export function author(id: string | null, email: string | null, names: Record<string, string>): string {
  return (id && names[id]?.trim()) || email?.split("@")[0] || "An admin";
}
export function vancouverTime(value: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value)).replace(/\s*([ap])\.m\./i, " $1m").replace(/\s*([ap])m/i, " $1m").toLowerCase().replace(/^./, c => c.toUpperCase());
}
export function commentResult(c: ReviewComment, send?: ReviewSend): string {
  if (c.status === "done") {
    const unchanged = c.before !== null && c.after !== null && JSON.stringify(c.before) === JSON.stringify(c.after);
    return c.resultNote && (unchanged || !send?.revision) ? "Kept as is" : "Applied";
  }
  if (c.status === "sent") return "In progress";
  const reason = plainReason(c.error ?? "");
  return `Not applied: ${reason === NEEDS_A_LOOK ? "Please review this comment and try again" : reason}`;
}
/** Open: still the admin's to edit, move or send. Every comment is either open or in the history, never both. */
const isOpen = (c: ReviewComment) => c.status === "pending" || c.status === "failed" || c.status === "stale";
export function historyGroups(comments: ReviewComment[], sends: ReviewSend[]) {
  const earlier = comments.filter(c => !isOpen(c));
  const groups = sends.map(send => ({ send, comments: earlier.filter(c => c.batchId === send.id) })).filter(g => g.comments.length);
  const other = earlier.filter(c => !sends.some(s => s.id === c.batchId));
  return { groups, other, count: earlier.length };
}
export function pendingComments(comments: ReviewComment[]) {
  return comments.filter(isOpen);
}
/** What "Send all comments" sends: a comment whose place changed must be placed again first. */
export function sendableComments(comments: ReviewComment[]) {
  return comments.filter(c => c.status === "pending" || c.status === "failed");
}
export function pageCounts(comments: ReviewComment[], page: number) {
  const onPage = comments.filter(c => c.page === page);
  return { pending: pendingComments(onPage).length, earlier: onPage.some(c => !pendingComments([c]).length) };
}
export function authorCounts(comments: ReviewComment[], names: Record<string, string>) {
  const counts = new Map<string, number>();
  for (const c of pendingComments(comments)) { const name = author(c.actor.id, c.actor.email, names); counts.set(name, (counts.get(name) ?? 0) + 1); }
  return [...counts].map(([name, count]) => ({ name, count }));
}
export function sendLabel(comments: ReviewComment[], names: Record<string, string>) {
  const counts = authorCounts(sendableComments(comments), names), people = counts.map(c => c.name);
  const list = people.length < 2 ? people.join("") : `${people.slice(0, -1).join(", ")} and ${people.at(-1)}`;
  return `Send all comments (${sendableComments(comments).length})${list ? ` from ${list}` : ""}`;
}
export function commentPlan(page: CommentPage | undefined, c: ReviewComment) {
  return workbookCommentRoute(page, c.note, c.route) === "layout" ? "Layout: goes to the team, usually the same day" : "Wording: applies by itself in a minute";
}
export function versionStatus(version: ReviewVersion, sends: ReviewSend[], comments: ReviewComment[], names: Record<string, string>) {
  const made = sends.find(s => s.revision === version.revision);
  const applied = made ? comments.filter(c => c.batchId === made.id && c.status === "done" && commentResult(c, made) === "Applied").length : 0;
  let line = `Version ${version.revision}, made ${version.displayAt ?? vancouverTime(version.createdAt)}`;
  if (version.byUser || version.byEmail) line += ` by ${author(version.byUser, version.byEmail, names)}`;
  line += ".";
  const included = comments.filter(c => { const send = sends.find(s => s.id === c.batchId); return c.status === "done" && !!send && send.revision !== null && send.revision <= version.revision && commentResult(c, send) === "Applied"; }).length;
  const total = Math.max(included, made ? applied : 0);
  const plural = (n: number) => `${n} ${n === 1 ? "comment" : "comments"}`;
  if (total > applied && applied > 0) line += ` ${plural(total)} applied in total (${applied} in this version).`;
  else if (total > 0 && applied === 0) line += ` ${plural(total)} applied in total.`;
  else if (applied > 0) line += ` ${plural(applied)} applied in this version.`;
  const later = sends.find(s => (s.status === "done" || s.status === "failed") && Date.parse(s.finishedAt ?? s.createdAt) > Date.parse(version.createdAt) && s.revision === null && comments.some(c => c.batchId === s.id));
  if (!later) return { line, later: null, laterTone: "note" as const };
  const when = later.displayFinishedAt ?? vancouverTime(later.finishedAt ?? later.createdAt);
  const group = comments.filter(c => c.batchId === later.id), kept = group.filter(c => commentResult(c, later) === "Kept as is");
  const missed = group.filter(c => isOpen(c));
  if (missed.length) {
    const reasons = [...new Set(missed.map(c => commentResult(c, later).replace(/^Not applied: /, "")))];
    return { line, later: `Last send, ${when}: ${missed.length} ${missed.length === 1 ? "comment was" : "comments were"} not applied. ${reasons.join("; ")}${/[.!?]$/.test(reasons.at(-1) ?? "") ? "" : "."} ${missed.length === 1 ? "It stays" : "They stay"} open below.`, laterTone: "warn" as const };
  }
  const pages = [...new Set(kept.map(c => c.page))].sort((a, b) => a - b);
  const pageList = pages.length > 1 ? `${pages.slice(0, -1).join(", ")} and ${pages.at(-1)}` : pages.join("");
  const detail = kept.length ? ` ${kept.length} ${kept.length === 1 ? "comment was" : "comments were"} kept as ${kept.length === 1 ? "it was" : "they were"} (page${pages.length === 1 ? "" : "s"} ${pageList}).` : "";
  return { line, later: `Last send, ${when}: nothing changed.${detail}`, laterTone: "note" as const };
}
export function changedPages(current: ReviewVersion, previous: ReviewVersion | undefined): number[] {
  if (!previous?.rendering || !current.rendering) return [];
  return current.rendering.pages.filter(p => { const old = previous.rendering?.pages.find(x => x.number === p.number); return !!old && old.image.path !== p.image.path; }).map(p => p.number);
}
