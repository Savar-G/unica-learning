// Small parts of the remaining admin pages (D-313, D-315), after Home, Production and Families: the summary tiles, a
// section head with its count and one quiet line, a ranked bar list, filter pills and a calm empty state. Safe in the
// browser too (no request reads), so client pages can use them.
import Link from "next/link";
import type { ReactNode } from "react";
import { barPercent } from "@/lib/admin-pages";
import "./admin-blocks.css";

export type BlockTone = "ok" | "warn" | "bad" | "info";

export interface Tile { key: string; label: string; value: ReactNode; sub?: ReactNode; tone?: BlockTone | null }

/** A row of number tiles: a mono label, a light number and one line under it. */
export function Tiles({ label, tiles }: { label: string; tiles: Tile[] }) {
  return (
    <dl className="ab-tiles" aria-label={label}>
      {tiles.map((t) => (
        <div key={t.key} className={`ab-tile${t.tone ? ` is-${t.tone}` : ""}`}>
          <dt>{t.label}</dt>
          <dd><b>{t.value}</b>{t.sub && <span>{t.sub}</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A section's head: the title, its count and one quiet line; `actions` on the right. */
export function SectionHead({ id, title, count, line, actions }: { id?: string; title: ReactNode; count?: ReactNode; line?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ab-head">
      <h2 id={id}>{title}</h2>
      {count !== undefined && count !== null && <span className="ab-count">{count}</span>}
      {actions && <span className="ab-head-actions">{actions}</span>}
      {line && <p>{line}</p>}
    </div>
  );
}

export interface Bar { key: string; label: ReactNode; value: number; text?: ReactNode; sub?: ReactNode; tone?: BlockTone | null }

/**
 * A ranked bar list: the label, a bar as long as its share of the longest, and the number as text, so the bars only
 * repeat what the words say. `max`: the longest bar's value (default: the largest value in the list).
 */
export function BarList({ label, bars, max, className = "" }: { label: string; bars: Bar[]; max?: number; className?: string }) {
  const top = max ?? Math.max(0, ...bars.map((b) => b.value));
  return (
    <ul className={`ab-bars ${className}`} aria-label={label}>
      {bars.map((b) => (
        <li key={b.key} className={b.tone ? `is-${b.tone}` : undefined}>
          <span className="ab-bar-label">{b.label}{b.sub && <span className="ab-bar-sub">{b.sub}</span>}</span>
          <span className="ab-bar-track" aria-hidden="true"><i style={{ width: `${barPercent(b.value, top)}%` }} /></span>
          <span className="ab-bar-n">{b.text ?? b.value.toLocaleString("en-CA")}</span>
        </li>
      ))}
    </ul>
  );
}

/** A small bar for one percent (0 to 100), with the percent as text beside it. */
export function PercentBar({ percent, label }: { percent: number | null; label: string }) {
  if (percent === null) return <span className="ab-pct is-none">-</span>;
  const tone = percent >= 75 ? "ok" : percent >= 50 ? "mid" : "low";
  return (
    <span className={`ab-pct is-${tone}`} title={label}>
      <span className="ab-pct-track" aria-hidden="true"><i style={{ width: `${Math.max(2, Math.min(100, percent))}%` }} /></span>
      <span className="ab-pct-n">{percent}%</span>
    </span>
  );
}

export interface Pill { key: string; href: string; label: ReactNode; count?: number | null; current: boolean }

/** Filter pills: each is a link, the current one dark. */
export function Pills({ label, pills }: { label: string; pills: Pill[] }) {
  return (
    <nav className="ab-pills" aria-label={label}>
      {pills.map((p) => (
        <Link key={p.key} href={p.href} aria-current={p.current ? "true" : undefined} prefetch={false}>
          {p.label}{p.count !== undefined && p.count !== null && <span>{p.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** A calm empty state: a dashed box with one or two plain sentences. */
export const Empty = ({ children }: { children: ReactNode }) => <p className="ab-empty">{children}</p>;
