import Stripe from "stripe";
import { PLAN_EVENT_TYPES, applyPlanEvent, type PlanEvent, type PlanEventType } from "@/lib/plan-state";
import { livePlanStates } from "@/lib/plan-state-server";

// Stripe's webhook (#548): keeps one plan state per child in child_plan_states. Set up in the Stripe Dashboard with this
// URL; its signing secret is STRIPE_WEBHOOK_SECRET (docs/stripe-webhook.md). Stripe sends each event again until it gets
// a 2xx, so a Stripe or store error answers 500 and the event comes back; an event the site cannot use answers 204. The
// answer holds no data. src/proxy.ts does not match this path, so no session or desk check stands in front of it.

const planType = (type: string): type is PlanEventType => (PLAN_EVENT_TYPES as readonly string[]).includes(type);

/** The customer of a subscription or invoice event: an id, or an object in an expanded payload. */
function customerOf(object: unknown): string | null {
  const customer = (object as { customer?: string | { id?: unknown } | null }).customer;
  if (typeof customer === "string") return customer;
  return typeof customer?.id === "string" ? customer.id : null;
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set");
    return new Response(null, { status: 503 });
  }
  // The signature covers the exact bytes, so the body is read as text before anything parses it.
  const body = await request.text();
  let signed: Stripe.Event;
  try {
    signed = Stripe.webhooks.constructEvent(body, request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response(null, { status: 400 });
  }
  // A type the site does not keep: taken, so Stripe does not send it again.
  if (!planType(signed.type)) return new Response(null, { status: 204 });
  const event: PlanEvent = { id: signed.id, type: signed.type, created: signed.created, customer: customerOf(signed.data.object) };

  const states = livePlanStates();
  if (!states) {
    console.error("[stripe-webhook] the database or Stripe key is not set");
    return new Response(null, { status: 503 });
  }
  try {
    const outcome = await applyPlanEvent(event, states);
    // An old booking's customer has no card setup. Nothing can use its events, and the log keeps the trace.
    if (outcome === "no_match") console.warn("[stripe-webhook] no card setup for customer", event.customer ?? "(none)", event.type, event.id);
    return new Response(null, { status: 204 });
  } catch (e) {
    console.error("[stripe-webhook] event not kept; Stripe sends it again", event.type, event.id, e instanceof Error ? e.message : "failed");
    return new Response(null, { status: 500 });
  }
}
