// Workbooks > Marking (D-313, D-315): the parts of the Marking list and of one marked page. The answers waiting for our
// team come first, one card per scanned page with its action; then small bars of the shown pages per book; then the
// table of scanned pages. The mark buttons are the existing AdminTeamMark. Server components; the grouping is in
// src/lib/admin-marking.ts.
import Link from "next/link";
import type { ReactNode } from "react";
import { PAGE_BUCKETS, type pagesByBook } from "@/lib/admin-marking";
import { faceColor } from "@/lib/admin-production";
import type { HistoryStatus } from "@/lib/scan-history";
import { Chip, TestTag, type Tone } from "@/components/admin";
import "./admin-marking.css";

const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function Face({ parentId, name, test }: { parentId: string; name: string; test: boolean }) {
  return <span className={`adm-mk-face${test ? " is-test" : ""}`} style={{ background: faceColor(parentId, test) }} aria-hidden="true">{name.charAt(0).toUpperCase() || "?"}</span>;
}

/** A section head: the title, its count and one quiet line. */
export function MarkHead({ id, title, count, children }: { id: string; title: string; count?: number; children?: ReactNode }) {
  return <div className="adm-mk-head"><h2 id={id}>{title}</h2>{count !== undefined && <span className="adm-mk-count">{count}</span>}{children && <p>{children}</p>}</div>;
}

/** What the AI read, in words. */
export const readText = (read: string | null) => read === null ? "Not read" : read === "" ? "Empty" : read;

/** A group from teamGroups (src/lib/admin-marking.ts): one scanned page, or one answer with no saved photo. */
type WaitingGroup = { parent: string; childName: string; book: number; page: number; items: { item: string; question: number; read: string | null; issue: string | null }[] };

/**
 * One scanned page's waiting answers (or one answer with no saved photo). `action`: the page's link, or the answer's mark
 * buttons or the reason it cannot be marked here. `reason`: why an answer waits, in words. `since`: when it started
 * waiting, in the family's time.
 */
export function WaitingCard({ group, test, since, reason, action }: { group: WaitingGroup; test: boolean; since: string; reason: (issue: string | null) => string; action: ReactNode }) {
  const name = group.childName || "A child";
  return <article className={`adm-mk-card${test ? " is-test" : ""}`} aria-label={`${name}, Book ${group.book}, page ${group.page}: ${pl(group.items.length, "answer", "answers")} waiting`}>
    <div className="adm-mk-top">
      <Face parentId={group.parent} name={name} test={test} />
      <span className="adm-mk-who"><b>{name} · Book {group.book}, page {group.page}<TestTag test={test} /></b><span>Waiting since {since}</span></span>
      <Chip tone="warn">{pl(group.items.length, "answer", "answers")}</Chip>
    </div>
    <ul className="adm-mk-answers">{group.items.map((i) => <li key={i.item}>
      <b>Question {i.question}</b>
      <span>The AI read <q>{readText(i.read)}</q></span>
      <span className="adm-mk-why">{reason(i.issue)}</span>
    </li>)}</ul>
    <div className="adm-mk-act">{action}</div>
  </article>;
}

const BAR_LABEL: Record<string, string> = Object.fromEntries(PAGE_BUCKETS.map((b) => [b.bucket, b.text]));

/** The shown pages per book, as one bar each. Each label shows only that book's pages. */
export function PageBars({ books, href }: { books: ReturnType<typeof pagesByBook>; href: (workbookId: string) => string }) {
  if (!books.length) return null;
  const used = PAGE_BUCKETS.filter((b) => books.some((x) => x.n[b.bucket] > 0));
  return <section className="adm-mk-bars" aria-labelledby="mk-bars">
    <div className="adm-mk-bars-head">
      <h3 className="eyebrow" id="mk-bars">Pages by book</h3>
      <span className="adm-mk-hint">Of the pages listed below. Real families only.</span>
    </div>
    <ul className="adm-mk-bar-list">{books.map((b) => {
      const label = `${b.childName || "A child"}, Book ${b.book}: ${b.n.marked} of ${pl(b.total, "page", "pages")} marked${used.filter((u) => u.bucket !== "marked" && b.n[u.bucket]).map((u) => `, ${b.n[u.bucket]} ${u.text.toLowerCase()}`).join("")}`;
      return <li key={b.workbookId}>
        <Link className="adm-mk-bar-name" href={href(b.workbookId)} aria-label={`${b.childName || "A child"}, Book ${b.book}: show only this book's pages`}>{b.childName || "A child"} · Book {b.book}</Link>
        <span className="adm-mk-bar" role="img" aria-label={label}>{PAGE_BUCKETS.filter((u) => b.n[u.bucket] > 0).map((u) => <i key={u.bucket} className={`is-${u.bucket}`} style={{ flex: b.n[u.bucket] }} />)}</span>
        <span className="adm-mk-bar-n">{b.n.marked} of {b.total} marked</span>
      </li>;
    })}</ul>
    <ul className="adm-mk-legend" aria-hidden="true">{used.map((u) => <li key={u.bucket}><span className={`adm-mk-sw is-${u.bucket}`} />{BAR_LABEL[u.bucket]}</li>)}</ul>
  </section>;
}

const STATE_TONE: Record<HistoryStatus, Tone> = { ready: "ok", blank: "muted", unscored: "muted", review: "warn", pending: "info", failed: "bad", "never-scanned": "muted" };
export const StateChip = ({ status, label }: { status: HistoryStatus; label: string }) => <Chip tone={STATE_TONE[status]}>{label}</Chip>;

/** A mark's result in words, with its tone. */
export function ResultChip({ result, label, waiting = false }: { result: "right" | "wrong" | "blank" | null; label: string; waiting?: boolean }) {
  const tone: Tone = result === "right" ? "ok" : result === "wrong" ? "bad" : waiting ? "warn" : "muted";
  return <Chip tone={tone}>{label}</Chip>;
}

/** Who made a mark, in words. */
export const actorText = (actor: string) => actor === "admin" ? "Our team" : actor === "parent" ? "Parent" : actor === "system" ? "The AI" : actor;
