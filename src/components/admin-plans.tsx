// Workbooks > Plans and delivery (D-313, D-315): "Needs you" first (free months to start, plan starts Stripe never
// answered, books on hold, workbook emails to check), then the families by plan state, then every saved card and the
// waitlist. Each card's plan start and workbook emails are the existing controls (admin-records.tsx), shown once on the
// page: in Needs you when the card is there, else in its table row. The rules are in src/lib/admin-plans.ts.
import Link from "next/link";
import type { ReactNode } from "react";
import type { CardSetupRow, ChildRow, ParentRow, WaitlistRow } from "@/lib/admin-store";
import { PLAN_STATE_TEXT, emailsToCheck, familyPlanCounts, needsYou, planState, type NeedReason, type PlanState } from "@/lib/admin-plans";
import { faceColor, shortWhen } from "@/lib/admin-production";
import { adminParentPath, adminReportPath, when } from "@/lib/admin-view";
import { PLAN_REMINDER_ADMIN } from "@/lib/plan-reminder";
import { stripeCustomerUrl } from "@/lib/stripe";
import type { WorkbookEmailRecord } from "@/lib/workbook-email";
import { Chip, Table, TestTag, type Tone } from "@/components/admin";
import { CardEmails, PlanStartAction, childPath } from "@/components/admin-records";
import { ScanHold } from "@/components/admin-scan-progress";
import "./admin-plans.css";

type People = { parent: ParentRow | null; child: ChildRow | null };
export type PlanCard = CardSetupRow & People;
export type Hold = { workbookId: string; childId: string; parentId: string; number: number; testFamily: boolean };

const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const cardAnchor = (id: string) => `pl-card-${id}`;

const STATE_TONE: Record<PlanState, Tone> = {
  not_saved: "muted", card_saved: "warn", free_month: "info", paying: "ok", payment_failed: "bad", paused: "muted", cancelled: "muted", check: "warn",
};

const EMAIL_STATUS: Record<string, string> = { failed: "not sent", unknown: "delivery uncertain" };
const emailName = (r: WorkbookEmailRecord) => r.kind === "welcome" ? "Welcome email" : r.kind === "plan_start" ? "Free month confirmation"
  : `Workbook ${r.workbook_number} ${r.kind === "ready" ? "ready" : "delivery"} email`;

function Face({ parentId, name, test }: { parentId: string; name: string; test: boolean }) {
  return <span className={`adm-pl-face${test ? " is-test" : ""}`} style={{ background: faceColor(parentId, test) }} aria-hidden="true">{name.charAt(0).toUpperCase() || "?"}</span>;
}

/** The price line: the stored monthly price, or the saved amount as a ceiling when the price read failed. */
function Price({ c }: { c: PlanCard }) {
  return <>{c.plan === "one" ? "Math" : "Math and reading"} · {c.planPriceUnread ? `up to CAD ${c.price} (price not read)` : `CAD ${c.planMonthly ?? c.price} a month`}</>;
}

// ---------- Needs you ----------

const NEED_TITLE: Record<NeedReason, { title: string; hint: string; chip: string; tone: Tone }> = {
  start_due: { title: "Free months to start", hint: "Book 1 has arrived at the family's home and no plan has started.", chip: "Start the free month", tone: "warn" },
  start_stuck: { title: "Plan starts to check", hint: "Stripe did not answer these starts. Check the family in Stripe before you close one.", chip: "Start not answered", tone: "bad" },
  email: { title: "Workbook emails to check", hint: "An email was not sent, or its delivery is uncertain.", chip: "Email to check", tone: "warn" },
};

function NeedCard({ c, reasons, now, isTest }: { c: PlanCard; reasons: NeedReason[]; now: Date; isTest: boolean }) {
  const child = c.child?.first_name ?? "Child";
  const emails = reasons.includes("email") ? emailsToCheck(c, now.getTime()) : [];
  return <article id={cardAnchor(c.id)} className={`adm-pl-card is-you${isTest ? " is-test" : ""}`} aria-label={`${child}: ${NEED_TITLE[reasons[0]].chip}`}>
    <div className="adm-pl-top">
      <Face parentId={c.parent_id} name={child} test={isTest} />
      <span className="adm-pl-who">
        <b><Link href={childPath(c.child_id)}>{child}</Link><TestTag test={isTest} /></b>
        <span><Link href={adminParentPath(c.parent_id)}>{c.parent?.name ?? "Family"}</Link></span>
      </span>
      <Chip tone={NEED_TITLE[reasons[0]].tone}>{NEED_TITLE[reasons[0]].chip}</Chip>
    </div>
    <p className="adm-pl-text"><Price c={c} />{c.card_saved_at ? `. Card saved ${shortWhen(c.card_saved_at, now)}.` : "."}</p>
    {emails.length > 0 && <ul className="adm-pl-lines">{emails.map((r) => <li key={r.id}>{emailName(r)}: {EMAIL_STATUS[r.status === "sending" ? "unknown" : r.status] ?? "check it"}</li>)}</ul>}
    {/* The card's plan start control lives here, not in its row: the start, the stuck start's recovery, or why it cannot start yet. */}
    {(c.stuckPlanStart || (c.planStarted === false && c.card_saved_at && c.stripe_customer_id)) && <div className="adm-pl-act"><PlanStartAction card={c} /></div>}
    <div className="adm-pl-emails"><CardEmails card={c} /></div>
  </article>;
}

function HoldCard({ hold, child, isTest }: { hold: Hold; child: string | null; isTest: boolean }) {
  return <article className={`adm-pl-card is-you${isTest ? " is-test" : ""}`} aria-label={`${child ?? "A child"}: book on hold`}>
    <div className="adm-pl-top">
      <Face parentId={hold.parentId} name={child ?? "?"} test={isTest} />
      <span className="adm-pl-who"><b>{child ?? "A child"} · Book {hold.number + 1}<TestTag test={isTest} /></b><span>Waiting for Book {hold.number}&apos;s scans</span></span>
      <Chip tone="warn">On hold</Chip>
    </div>
    <div className="adm-pl-text"><ScanHold number={hold.number} /></div>
    <div className="adm-pl-act"><Link className="btn adm-btn ghost" href={childPath(hold.childId)} prefetch={false}>Open child and workbook {hold.number}</Link></div>
  </article>;
}

function NeedGroup({ id, title, hint, count, children }: { id: string; title: string; hint: string; count: number; children: ReactNode }) {
  return <section className="adm-pl-need" aria-labelledby={id}>
    <div className="adm-pl-need-head"><h3 id={id}>{title}</h3><span className="adm-pl-count" aria-label={pl(count, "item", "items")}>{count}</span><p>{hint}</p></div>
    <div className="adm-pl-cards">{children}</div>
  </section>;
}

// ---------- the summary ----------

function Summary({ cards, waitlist, waitMore, cardsMore, isTest }: { cards: PlanCard[]; waitlist: WaitlistRow[]; waitMore: boolean; cardsMore: boolean; isTest: (id: string) => boolean }) {
  const f = familyPlanCounts(cards, isTest);
  const waiting = new Set(waitlist.filter((w) => !isTest(w.parent_id)).map((w) => w.parent_id)).size;
  const label = `${pl(f.total, "family", "families")} with a card: ${f.states.map((s) => `${s.text} ${s.n}`).join(", ")}. ${pl(waiting, "family", "families")} on the waitlist.`;
  return <section className="adm-pl-sum" aria-labelledby="pl-sum">
    <div className="adm-pl-sum-head">
      <h2 className="eyebrow" id="pl-sum">Families by plan</h2>
      <span className="adm-pl-hint">Real families only{cardsMore ? ", from the newest cards listed below" : ""}. A family with two children counts once, at its furthest child.</span>
    </div>
    <div className="adm-pl-sum-body">
      <div className="adm-pl-sum-main">
        <div className="adm-pl-bar" role="img" aria-label={label}>
          {f.total === 0 ? <i className="is-empty" /> : f.states.filter((s) => s.n > 0).map((s) => <i key={s.state} className={`is-${s.state}`} style={{ flex: s.n }} />)}
        </div>
        <ul className="adm-pl-legend">{f.states.map((s) => <li key={s.state} className={s.n ? "" : "is-zero"}>
          <span className={`adm-pl-sw is-${s.state}`} aria-hidden="true" /><span className="adm-pl-legend-n">{s.n}</span><span>{s.text}</span>
        </li>)}</ul>
      </div>
      <div className="adm-pl-wait"><strong>{waiting}{waitMore ? "+" : ""}</strong><span>{waiting === 1 ? "family" : "families"} on the waitlist</span></div>
    </div>
  </section>;
}

// ---------- the tables ----------

function CardsList({ cards, needs, tag }: { cards: PlanCard[]; needs: Set<string>; tag: (id: string) => boolean }) {
  return <Table label="All saved cards" head={["Family", "Child", "Card saved (Pacific)", "Plan", "Workbook"]} empty="No card setups.">
    {cards.map((c) => {
      const stripe = c.stripe_customer_id ? stripeCustomerUrl(c.stripe_customer_id) : null;
      const state = planState(c), here = needs.has(c.id);
      return <tr key={c.id}>
        <td><Link href={adminParentPath(c.parent_id)}>{c.parent?.name ?? "Family"}</Link><TestTag test={tag(c.parent_id)} />
          <span className="adm-sub adm-pl-links">{stripe && <a href={stripe} target="_blank" rel="noopener noreferrer">Open in Stripe</a>}{c.report_id && <Link href={adminReportPath(c.report_id)}>Report</Link>}</span></td>
        <td><Link href={childPath(c.child_id)}>{c.child?.first_name ?? "Child"}</Link></td>
        <td className="adm-nowrap">{c.card_saved_at ? when(c.card_saved_at) : <Chip tone="warn">Not saved</Chip>}</td>
        <td className="adm-pl-plan"><Chip tone={STATE_TONE[state]}>{PLAN_STATE_TEXT[state]}</Chip>
          <span className="adm-sub"><Price c={c} /></span>
          {c.planFirstCharge && <span className="adm-sub">First charge {when(c.planFirstCharge)}</span>}
          {state === "check" && <span className="adm-sub">{c.planStarted === true ? "Plan started." : "Check the plan in Stripe before starting a free month."}</span>}
          {/* A stuck start is always in Needs you, so here the control is the start's gate (why it cannot start yet). */}
          {!here && c.planStarted === false && c.card_saved_at && c.stripe_customer_id && <div className="adm-pl-cell-act"><PlanStartAction card={c} /></div>}
        </td>
        <td className="adm-pl-wb">{here ? <a href={`#${cardAnchor(c.id)}`}>In Needs you above</a> : <CardEmails card={c} />}</td>
      </tr>;
    })}
  </Table>;
}

function WaitList({ waitlist, tag }: { waitlist: (WaitlistRow & People)[]; tag: (id: string) => boolean }) {
  return <Table label="Waitlist" head={["Family", "Child", "Curriculum", "Joined (Pacific)"]} empty="No waitlist entries.">
    {waitlist.map((w) => <tr key={w.id}>
      <td><Link href={adminParentPath(w.parent_id)}>{w.parent?.name ?? "Family"}</Link><TestTag test={tag(w.parent_id)} /></td>
      <td><Link href={childPath(w.child_id)}>{w.child?.first_name ?? "Child"}</Link>{w.report_id && <span className="adm-sub"><Link href={adminReportPath(w.report_id)}>Report</Link></span>}</td>
      <td>{w.province}</td>
      <td className="adm-nowrap">{when(w.created_at)}</td>
    </tr>)}
  </Table>;
}

function GroupHead({ id, title, count, hint }: { id: string; title: string; count: number | string; hint: string }) {
  return <div className="adm-pl-group-head"><h2 id={id}>{title}</h2><span className="adm-pl-count">{count}</span><p>{hint}</p></div>;
}

/**
 * The page. `show`: the "Show test families" switch; `isTest`: the test and team families (tagged while shown, never
 * counted). `holds`: the books on hold (loadAdminScanHolds). `cardsMore`, `waitMore`: the lists stopped at their limit.
 */
export function PlansView({ cards, waitlist, holds, show, isTest, now, cardsMore, waitMore }: {
  cards: PlanCard[]; waitlist: (WaitlistRow & People)[]; holds: { rows: Hold[]; unavailable: boolean; more: boolean };
  show: boolean; isTest: (parentId: string) => boolean; now: Date; cardsMore: boolean; waitMore: boolean;
}) {
  const tag = (id: string) => show && isTest(id);
  const groups = needsYou(cards, now.getTime());
  const needs = new Set(Object.values(groups).flat().map((g) => g.card.id));
  const names = new Map(cards.map((c) => [c.child_id, c.child?.first_name ?? null]));
  const real = (parentId: string, test = false) => !test && !isTest(parentId);
  const count = (k: NeedReason) => groups[k].filter((g) => real(g.card.parent_id)).length;
  const holdCount = holds.rows.filter((h) => real(h.parentId, h.testFamily)).length;
  const total = count("start_due") + count("start_stuck") + holdCount + count("email");
  const needGroup = (k: NeedReason) => groups[k].length > 0 && <NeedGroup id={`pl-${k}`} title={NEED_TITLE[k].title} hint={NEED_TITLE[k].hint} count={count(k)}>
    {groups[k].map((g) => <NeedCard key={g.card.id} c={g.card} reasons={g.reasons} now={now} isTest={tag(g.card.parent_id)} />)}
  </NeedGroup>;
  const any = needs.size > 0 || holds.rows.length > 0;
  return <div className="adm-pl">
    <section aria-labelledby="pl-you">
      <GroupHead id="pl-you" title="Needs you" count={total} hint="Start each free month only after Book 1 has arrived at the family's home." />
      {!any && !holds.unavailable && <div className="adm-pl-calm">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        <p><b>Nothing waits for us.</b> A free month to start, a plan start Stripe did not answer, a book on hold or an email to check shows here.</p>
      </div>}
      {needGroup("start_due")}
      {needGroup("start_stuck")}
      {(holds.rows.length > 0 || holds.unavailable) && <NeedGroup id="pl-holds" title="Books on hold" hint="No pages scanned by day 21, so the next book waits for the family's scans." count={holdCount}>
        {holds.rows.map((h) => <HoldCard key={h.workbookId} hold={h} child={names.get(h.childId) ?? null} isTest={tag(h.parentId) || (show && h.testFamily)} />)}
        {holds.unavailable && <p className="adm-pl-empty" role="status">Some books on hold could not be read. Check again.</p>}
      </NeedGroup>}
      {holds.more && <p className="adm-note">More books may be on hold. Only the newest are shown here. Open each child to check the rest.</p>}
      {needGroup("email")}
    </section>
    <Summary cards={cards} waitlist={waitlist} waitMore={waitMore} cardsMore={cardsMore} isTest={isTest} />
    <section aria-labelledby="pl-cards">
      <GroupHead id="pl-cards" title="All saved cards" count={cards.length} hint="Newest change first. A card that is not saved yet shows Not saved." />
      <CardsList cards={cards} needs={needs} tag={tag} />
    </section>
    <section aria-labelledby="pl-wait">
      <GroupHead id="pl-wait" title="Waitlist" count={waitlist.length} hint="Families who joined the waitlist from their child's report. Newest first." />
      <WaitList waitlist={waitlist} tag={tag} />
    </section>
    <details className="adm-pl-how">
      <summary>How a plan starts</summary>
      <p>For the shipping address, use &quot;Open in Stripe&quot; on the child&apos;s card and check Shipping details on the customer. If no shipping address is saved, ask the parent for it before mailing the workbook. A billing address is not a confirmed shipping address.</p>
      <p>A saved card is not a payment. Open the child&apos;s workbook 1 and save its delivery confirmation. Then press &quot;Workbook delivered: start plan&quot;. The family&apos;s one 30-day free window begins with its first child&apos;s plan start. A sibling who starts inside it has the same trial end. A sibling who starts after it pays immediately. Adding a card, printing a workbook, and sending tracking details do not start it. Stripe charges the monthly price on day 30, then every month. {PLAN_REMINDER_ADMIN}, with a link to manage or cancel the plan. Home shows who is paying.</p>
    </details>
  </div>;
}
