# Hosted Stripe configuration

Observed on 6 November 2026 through Aside on Savars-MacBook-Pro-5.local.

Savar authorized dashboard activation and the required Stripe configuration work. The existing live destination was edited. No customer, subscription, invoice or payment was changed.

- Account: acct_1UOOQgGTsggtqumU.
- Destination: we_1UYU6EGTsggtqumUYLBZuh4k, charming-harmony.
- Status after save and a new page load: Active.
- URL: https://unicalearning.com/api/stripe-webhook.
- Payload: Snapshot.
- API version: 2026-09-30.endive.

The selected events were checked before the save. The destination was loaded again. Its edit form then showed exactly these seven checked events:

1. customer.subscription.created
2. customer.subscription.deleted
3. customer.subscription.paused
4. customer.subscription.resumed
5. customer.subscription.updated
6. invoice.paid
7. invoice.payment_failed

The five existing events remain. Only paused and resumed were added. The signing secret was not revealed or changed. The second edit form was cancelled without a write.

The existing site key's permission summary showed Subscriptions Write, Invoices Write, Customers Write and Payment Methods Write. No permission or key changed. Stripe documents subscription_write as the required restricted-key permission for native pause schedules: https://docs.stripe.com/billing/subscriptions/pause/schedules. No separate schedule permission appeared in the summary. Vercel masks the stored production key, so this audit does not independently prove its exact mapping to the named key.

The destination showed zero deliveries for the current week. This proves saved configuration, not a delivered event, a verified signing-secret match or a real reminder email. No real customer event was resent for this check. Dashboard and family-marking switches remain unchanged.
