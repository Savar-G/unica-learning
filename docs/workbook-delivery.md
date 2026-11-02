# Confirm delivery of a numbered workbook

Open a shipped workbook under Admin > Workbooks. Enter the date and time when it arrived at the family's home. The form shows the family's time zone. Press **Confirm workbook delivered**. Reload shows the saved time and who recorded it. The workbook status remains `shipped`.

Each numbered workbook needs its own receipt. Repeat the same confirmation safely. A different time is refused. The receipt's actual delivery time and server record time are separate. No old receipt is inferred from a shipment, an email, a card Boolean, or a Stripe date.

For workbook 1, save its receipt before using **Workbook delivered: start free month** under Cards and waitlist. The separate billing confirmation and existing Stripe start behavior remain. Recording any delivery makes no billing request. Workbook 2 and later deliveries do not restart a plan.

`confirmDelivery`, `DeliveryStore.receipt`, and `deliveryDeadlines` are the public interfaces in `src/lib/workbook-delivery.ts`. The Supabase store uses the current session. The database checks live admin membership, workbook identity and shipment, time validity, uniqueness, and family freeze in one transaction. Repeated confirmations return the original actor, audit ID, and server time. Conflicting times do not change the receipt.

The local input uses minute precision. It rejects invalid dates, clock gaps, delivery before shipment, and future delivery. Repeated clock times select the earlier instant. Deadline calculations preserve the local clock through `family-time.ts`, including its dated zone rules and its first-valid-instant rule for clock gaps. The stored time zone includes the explicit override choice for postal exceptions.

S11b (#475) owns accepted scans, inactivity episodes, scan re-evaluation when delivery is recorded, and unique trigger claims. It must read this workbook's receipt and call `deliveryDeadlines`; no receipt means no delivery-based anchor. This slice neither creates scan triggers nor sends scan reminders. Existing S1 attachments are not accepted progress scans.

Evidence and its limits are in `.design/experiments/r474/`. No real family row or paid provider was used. Visual approval is required from Savar before merge.
