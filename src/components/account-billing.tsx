import { UpdateCard } from "@/components/account-plan";
import { PlanText, planDay } from "@/components/plan-text";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { canUpdateCard, type FamilyBilling, type FamilyInvoice, type InvoiceStatus } from "@/lib/billing";
import type { FamilyZone } from "@/lib/family-time";

const STATUS: Record<InvoiceStatus, string> = { paid: "Paid", no_charge: "No charge", due: "Due", not_paid: "Not paid", cancelled: "Cancelled" };
const amount = ({ cents, currency }: FamilyInvoice) => `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;

function Unavailable({ children }: { children: string }) {
  return <p role="alert" className="acct-alert">{children} Try again soon, or email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>;
}

function Invoices({ invoices, zone }: { invoices: FamilyInvoice[]; zone: FamilyZone }) {
  if (invoices.length === 0) return <p>No invoices yet.</p>;
  return (
    <ul className="pd-invoices">
      {invoices.map((invoice) => {
        const day = planDay(invoice.at, zone);
        const word = invoice.status === "paid" || invoice.status === "no_charge" ? "Receipt" : "Invoice";
        return (
          <li key={invoice.id}>
            <span className="pd-invoice-day">{day}</span>
            <span className="pd-invoice-child">{invoice.childName}</span>
            <span className="pd-invoice-amount">{amount(invoice)}</span>
            <span className="pd-invoice-status">{STATUS[invoice.status]}</span>
            {invoice.receiptUrl
              ? <a className="pd-invoice-link" href={invoice.receiptUrl} target="_blank" rel="noopener noreferrer" aria-label={`${word} for ${invoice.childName}, ${day} (opens in a new tab)`}>{word}</a>
              : <span className="pd-invoice-link" />}
          </li>
        );
      })}
    </ul>
  );
}

/** Each child's plan and the family's invoices, as `loadFamilyBilling` read them. */
export function AccountBilling({ billing, zone }: { billing: FamilyBilling; zone: FamilyZone }) {
  if (billing.state === "unavailable") return <Unavailable>We cannot load billing now.</Unavailable>;
  return (
    <>
      <h2>Plans</h2>
      {billing.plans.length === 0 && <p>You do not have a plan yet.</p>}
      {billing.plans.length > 0 && (
        <ul className="acct-kids pd-plans">
          {billing.plans.map(({ childId, firstName, cardId, plan }) => (
            <li key={childId} className="acct-kid acct-plan">
              <div>
                <b>{firstName}</b>
                {plan ? <PlanText plan={plan} zone={zone} cardUpdate="here" /> : <p>No plan yet.</p>}
              </div>
              {plan && cardId && canUpdateCard(plan) && <UpdateCard cardId={cardId} name={firstName} />}
            </li>
          ))}
        </ul>
      )}
      <h2>Invoices</h2>
      {billing.invoices.state === "loaded"
        ? <Invoices invoices={billing.invoices.invoices} zone={zone} />
        : <Unavailable>We cannot load billing now, so your invoices do not show.</Unavailable>}
    </>
  );
}
