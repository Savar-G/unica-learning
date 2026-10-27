// Resources and Blog sections: the page shell, the article layout and the blocks that content files use.
// Writers import blocks from "@/components/article": Section, KeyFacts, DataTable, Callout,
// AssessmentCta, Cite. ArticleLayout, ArticleCard and ResourcesShell are used by the routes only.
import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/site";
import { Eyebrow, Faq, Nav as NavBar } from "@/ds";
import { Motion } from "@/components/motion";
import { StartLink, StartNote } from "@/components/start-link";
import { Footer, START_LABEL } from "@/components/sections";
import { ARTICLE_SECTIONS, articlePath, formatResourceDate, type ArticleBase, type ArticleSection, type CardItem } from "@/lib/resource-format";
import { articleJsonLd, jsonLdHtml } from "@/lib/structured-data";
import { Rise } from "./drawn";
import "./article.css";

// Home-page section links, made absolute so they work from these pages.
const LINKS = [
  { label: "How it works", href: "/#how" },
  { label: "Pricing", href: "/#price" },
  { label: "FAQ", href: "/#faq" },
];

type Tone = "sun" | "peach" | "sky" | "mint";

/* ------------------------------------------------------------- page shell */

/** Site nav, frame, footer and motion. Used by /resources, /blog and every article. */
export function ResourcesShell({ jsonLd, navSrc, children }: { jsonLd: unknown; navSrc: string; children: ReactNode }) {
  return (
    <div className="look-root" data-look="warm" id="top">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      <NavBar brand={BRAND} home="/" links={LINKS} cta={<StartLink className="btn sm" src={navSrc}>Free assessment</StartLink>} />
      <div className="frame">
        {children}
        <Footer />
      </div>
      <Motion />
    </div>
  );
}

/* --------------------------------------------------------- article layout */

/** One article: breadcrumb, header, body, FAQ, closing CTA, related reading and sources. */
export function ArticleLayout({ meta, section, related, children }: { meta: ArticleBase; section: ArticleSection; related: CardItem[]; children: ReactNode }) {
  const sec = ARTICLE_SECTIONS[section];
  const path = articlePath(section, meta.slug);
  const src = `${sec.src}-${meta.slug}`;
  const jsonLd = articleJsonLd({ section, path, title: meta.title, description: meta.description, published: meta.published, updated: meta.updated, faqs: meta.faqs });
  // A blog post shows its publish date, plus the update date once it changes. A guide shows the update date only.
  const dates = meta.published ? (
    <>
      Published <time dateTime={meta.published}>{formatResourceDate(meta.published)}</time>
      {meta.updated !== meta.published ? <> · Updated <time dateTime={meta.updated}>{formatResourceDate(meta.updated)}</time></> : null}
    </>
  ) : (
    <>Updated <time dateTime={meta.updated}>{formatResourceDate(meta.updated)}</time></>
  );
  return (
    <ResourcesShell jsonLd={jsonLd} navSrc={`${src}-nav`}>
      <main id="main" className="res res-article">
        <nav className="res-crumbs" aria-label="Breadcrumb">
          <ol>
            <li><Link href="/">Home</Link></li>
            <li><Link href={sec.path}>{sec.name}</Link></li>
            <li><span aria-current="page">{meta.title}</span></li>
          </ol>
        </nav>

        <header className="res-head">
          <Eyebrow>{meta.category}</Eyebrow>
          <h1>{meta.title}</h1>
          <p className="res-lead">{meta.lead}</p>
          <p className="res-updated">{dates}</p>
        </header>

        <article className="res-body">{children}</article>

        {meta.faqs?.length ? (
          <section className="res-part res-faq" aria-labelledby="res-faq-t">
            <h2 id="res-faq-t">Questions parents ask</h2>
            <Faq items={meta.faqs.map(({ q, a }) => ({ question: q, answer: a }))} />
          </section>
        ) : null}

        <Rise className="res-part res-close">
          <h2>See where your child is.</h2>
          <p>Take the free online math assessment on a laptop or tablet. Read the report before you choose a plan. Then each workbook is made for your child and mailed home.</p>
          <StartLink src={`${src}-close`}>{START_LABEL} <span className="arr">→</span></StartLink>
        </Rise>

        {related.length ? (
          <section className="res-part" aria-labelledby="res-related-t">
            <h2 id="res-related-t">{sec.relatedTitle}</h2>
            <ul className="res-cards">
              {related.map((r, i) => <ArticleCard key={r.href} item={r} index={i} />)}
            </ul>
          </section>
        ) : null}

        {meta.sources?.length ? (
          <section className="res-part res-sources" aria-labelledby="res-sources-t">
            <h2 id="res-sources-t">Sources</h2>
            <ol>
              {meta.sources.map((s, i) => (
                <li key={s.url + i} id={`source-${i + 1}`}>
                  <a href={s.url} rel="noopener" target="_blank">{s.label}</a>
                  <span className="res-accessed">Accessed {formatResourceDate(s.accessed)}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </main>
    </ResourcesShell>
  );
}

const TONES: Tone[] = ["sun", "sky", "peach", "mint"];

/** Hub, blog and related-reading card: the whole card is one link. A blog card shows its date and topic above the title. */
export function ArticleCard({ item, index = 0 }: { item: CardItem; index?: number }) {
  return (
    <li className="res-card" data-tone={TONES[index % TONES.length]}>
      <Link href={item.href}>
        {item.date ? (
          <p className="res-card-meta">
            <time dateTime={item.date}>{formatResourceDate(item.date)}</time>
            {item.category ? <> · {item.category}</> : null}
          </p>
        ) : null}
        <h3>{item.title}</h3>
        <p>{item.lead}</p>
        <span className="res-more" aria-hidden="true">{item.href.startsWith("/blog/") ? "Read post" : "Read guide"} <span className="arr">→</span></span>
      </Link>
    </li>
  );
}

/* ------------------------------------------------------- blocks for writers */

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * A titled part of the article. The h2 gets an id for anchor links (#id).
 * Pass `id` to fix the anchor; otherwise it is made from the title.
 */
export function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  const hid = id ?? slugify(title);
  return (
    <section className="res-sec" aria-labelledby={hid}>
      <h2 id={hid}>{title}</h2>
      {children}
    </section>
  );
}

/** Soft grey card with a short list of facts (3-6 short lines). */
export function KeyFacts({ title = "Key facts", items, tone = "sun" }: { title?: string; items: ReactNode[]; tone?: Tone }) {
  return (
    <aside className="res-card-box res-facts" data-tone={tone} aria-label={title}>
      <p className="eyebrow">{title}</p>
      <ul>
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </aside>
  );
}

/**
 * Simple table. The first cell of each row is the row header.
 * Scrolls sideways on phones; keyboard users can focus it to scroll.
 */
export function DataTable({ caption, columns, rows, note }: { caption: string; columns: string[]; rows: ReactNode[][]; note?: ReactNode }) {
  return (
    <figure className="res-table">
      {/* Visible title sits outside the scroll box so it never clips on phones; the caption names the table for screen readers. */}
      <p className="res-table-title" aria-hidden="true">{caption}</p>
      <div className="res-table-scroll" role="region" aria-label={caption} tabIndex={0}>
        <table>
          <caption className="sr">{caption}</caption>
          <thead>
            <tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (c === 0 ? <th key={c} scope="row">{cell}</th> : <td key={c}>{cell}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note ? <figcaption>{note}</figcaption> : null}
    </figure>
  );
}

/** Soft grey note with a coloured square: a tip, a note or a "what this means for you". */
export function Callout({ label = "Tip", tone = "sky", children }: { label?: string; tone?: Tone; children: ReactNode }) {
  return (
    <aside className="res-card-box res-callout" data-tone={tone} aria-label={label}>
      <p className="res-callout-label"><i aria-hidden="true" />{label}</p>
      <div>{children}</div>
    </aside>
  );
}

/** Inline call to action: one line of text and the "Take free assessment" link to /start (#82). */
export function AssessmentCta({ slug, children }: { slug: string; children?: ReactNode }) {
  return (
    <div className="res-cta">
      <p>{children ?? "Not sure where your child is? The free online math assessment shows their math level and gaps."}</p>
      <div>
        <StartLink src={`resource-${slug}`}>{START_LABEL} <span className="arr">→</span></StartLink>
        <StartNote />
      </div>
    </div>
  );
}

/** Superscript citation that links to the n-th entry of meta.sources: <Cite n={2} /> renders [2]. */
export function Cite({ n }: { n: number }) {
  return (
    <sup className="res-cite">
      <a href={`#source-${n}`} aria-label={`Source ${n}`}>[{n}]</a>
    </sup>
  );
}
