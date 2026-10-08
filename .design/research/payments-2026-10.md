# Payments research for the BC deposit flow (2026-10-08)

Read-only web research. Every bullet has a source URL. UNVERIFIED = could not confirm from a primary page.

## 1. Stripe Canada fees
- Domestic cards: 2.9% + CA$0.30 per successful transaction. International cards: extra 0.8% (so 3.7% + 0.30). Manually entered cards: extra 0.5%. Currency conversion: extra 2%. https://stripe.com/en-ca/pricing
- No setup, monthly, or hidden fees on standard pricing. https://stripe.com/en-ca/pricing
- Refunds: no refund fee for most methods, but the original processing fee is NOT returned. https://stripe.com/en-ca/pricing
- Disputes: CA$15 per dispute received. https://stripe.com/en-ca/pricing
- Stripe Billing: pay-as-you-go 0.7% of billing volume (on top of processing); monthly plan starts at CA$770 on a 1-year contract. https://stripe.com/en-ca/pricing
- Payment Links: no extra charge beyond standard pricing. https://stripe.com/en-ca/pricing
- Effect on a CA$25 deposit: fee about CA$1.03 (CA$1.30 intl). Refunding the deposit loses that fee. https://stripe.com/en-ca/pricing

## 2. Stripe Payment Links
- (a) URL params: `prefilled_email`, `locked_prefilled_email`, `prefilled_promo_code`, `prefilled_amount`, `locale`, `client_reference_id`, and `utm_source/medium/campaign/content/term`. https://docs.stripe.com/payment-links/customize and https://docs.stripe.com/payment-links/url-parameters
- `client_reference_id`: alphanumeric, dashes, underscores; up to 200 characters; invalid values are silently dropped (the page still works). Returned in the `checkout.session.completed` webhook. Do not put secrets in it. https://docs.stripe.com/payment-links/url-parameters
- `prefilled_email` must be valid; customer can edit it; percent-encode it. `locked_prefilled_email` makes it uneditable and wins if both are passed. https://docs.stripe.com/payment-links/customize
- `prefilled_phone` is not listed. Treat as unsupported. https://docs.stripe.com/payment-links/customize
- (b) Redirect URL can include `{CHECKOUT_SESSION_ID}` (Dashboard "After the payment" or API `after_completion[redirect][url]`). UTM params on the link are appended to the redirect. https://docs.stripe.com/payment-links/post-payment
- (c) Save card for later: Dashboard option "Save payment details for future use" under Advanced options when you create the link. A new Customer is created when saving and none is specified. API `payment_intent_data` is also on the object. https://docs.stripe.com/payment-links/customize and https://docs.stripe.com/payment-links/post-payment
- (c) Docs say to consult legal counsel on saving card details; Stripe suggests Link for returning customers. https://docs.stripe.com/payment-links/customize
- (d) Custom fields: up to 3 (text up to 255 chars, numbers, dropdown); Dashboard or API. Do not collect sensitive data. Phone number: Dashboard "Require customers to provide a phone number" or API `phone_number_collection`. Also name collection. Values arrive in the `checkout.session.completed` webhook. https://docs.stripe.com/payment-links/customize and https://docs.stripe.com/api/payment-link/object
- (e) Apple Pay / Google Pay automatic: UNVERIFIED on a fetched page. The API says methods shown are those enabled in payment method settings when `payment_method_types` is null. https://docs.stripe.com/api/payment-link/object

## 3. Stripe account opening in Canada (individual / sole proprietor)
- Business types in Canada: individual/sole proprietorship, company, non-profit. Sole proprietors need identifiers, a website, and a bank account (the page does not say which identifiers). https://support.stripe.com/questions/selling-on-stripe-without-a-separate-business-entity
- Legal entity verification: not required for individuals or sole proprietors. Business phone: not required for them. Valid physical Canadian address (no PO box). Representative identity verification required for all (selfie + ID fallback). https://support.stripe.com/questions/2024-updates-to-canada-verification-requirements-faqs
- SIN required or not: UNVERIFIED (no page states it). Business Number required: UNVERIFIED. Check the live onboarding form.
- Website requirements (refund policy, contact, terms): UNVERIFIED from a fetched page. Stripe can display return/refund/legal policies and support contact on the payment page (Checkout settings), and a terms checkbox needs a terms URL in Public details. https://docs.stripe.com/payment-links/customize
- Pre-orders: Stripe supports them but warns of risk, "especially when manufacturing physical goods". Best practice: "accept partial deposits, limit the number of orders", set realistic delivery dates, keep cash for refunds and disputes. https://support.stripe.com/questions/accepting-payments-for-pre-orders
- Stripe's two suggested patterns: save card with a SetupIntent and charge at fulfillment, or authorize and capture later (typically 7 days). https://support.stripe.com/questions/accepting-payments-for-pre-orders
- Reserves: connected-account reserves cap at 180 days (Connect doc). Standard-account reserve rules for pre-orders: UNVERIFIED; third-party sources name long delivery gaps and pre-orders as triggers. https://edge-docs.stripe.com/connect/connected-account-reserves
- Restricted-business list does not mention pre-orders or deposits. https://stripe.com/ca/legal/restricted-businesses

## 4. Authorization hold length
- Standard online card hold: 7 days (Visa MIT 5 days; Visa CIT, Mastercard, Amex, Discover 7 days). https://docs.stripe.com/payments/place-a-hold-on-a-payment-method
- Extended authorization up to 30 days (Visa 29 days 18 hours), no regional restriction, Visa/MC/Amex/Discover. But: offered on IC+ pricing (blended users must contact support); Visa outside hotel/lodging/rental/cruise adds 0.08% per transaction; many networks allow it only when the final amount is unknown. https://docs.stripe.com/payments/extended-authorization?platform=web&ui=stripe-hosted
- Verdict: a hold does NOT cover "several weeks" reliably (30 days max, eligibility limited). Save the card instead. https://docs.stripe.com/payments/place-a-hold-on-a-payment-method

## 5. Turning a deposit into a subscription later
- Best fit: Customer invoice balance credit. A negative balance transaction (credit) auto-applies to the next finalized invoice, up to the invoice total. Create in Dashboard (Adjust balance) or API `POST /v1/customers/{id}/balance_transactions` with a negative amount and `currency`. https://docs.stripe.com/billing/customer/balance
- Constraints: currencies must match; balance does not apply to invoices from Checkout Sessions with `invoice_creation` enabled. https://docs.stripe.com/billing/customer/balance
- Credit notes also create invoice-balance credit (for a paid invoice). https://docs.stripe.com/billing/customer/balance
- Alternative: Stripe's pre-order guidance (save card via SetupIntent, charge later). https://support.stripe.com/questions/accepting-payments-for-pre-orders
- Refund caveat: refunding the deposit does not return the Stripe fee. https://stripe.com/en-ca/pricing
- Coupon route: not fetched. UNVERIFIED.

## 6. Shopify Canada
- Plans (CAD, monthly / yearly per month): Basic 49 / 37; Grow 132 / 99; Advanced 517 / 389; Plus from 3,400. Starter not on the page; a 2025 third-party guide says about CAD 7 (UNVERIFIED). https://www.shopify.com/ca/pricing
- Shopify Payments online (Canada): Basic 2.8% + 30c; Grow 2.6% + 30c; Advanced 2.4% + 30c. https://www.shopify.com/ca/pricing
- Third-party gateway fee: Basic 2%, Grow 1%, Advanced 0.6%. https://www.shopify.com/ca/pricing
- Deposits / pre-orders: native support UNVERIFIED (no Shopify Help Center page found); third-party sources show apps (PartialPay from USD 9/mo, Zalify Prepay, STOQ). https://apps.shopify.com/partialpay
- Fit with custom Next.js form: poor. Shopify wants to own the cart, checkout, and customer record; a bespoke signup form plus a deposit would need an app or a headless build. This is judgement, not a sourced fact. https://www.shopify.com/ca/pricing

## 7. Alternatives
- Square Canada: online / payment links via Online Checkout 2.8% + 30c; payment links made in Virtual Terminal and keyed/card-on-file 3.3% + 15c; foreign-issued cards +1.5%; Free plan CA$0/mo; recurring invoice fee not listed. https://squareup.com/ca/en/pricing
- Helcim: interchange-plus; keyed/online margin 0.50% + 25c at under CA$50K monthly volume (plus interchange); no monthly fee; recurring billing +0.4%; refunds free to issue but original fees owed; payment links offered. https://www.helcim.com/pricing/
- PayPal Canada: 2.90% + CA$0.30 domestic commercial; +0.80% US / +1.00% other international; refunds free to issue but original fee not returned. https://www.paypal.com/ca/business/paypal-business-fees

## 8. BC consumer law (BPCPA, SBC 2004 c.2, Part 4)
- Distance sales contract = supply of goods or services not entered into in person (goods: consumer cannot inspect first). A paid-in-advance online order is one. https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/04002_04
- Disclosure (s.18.2-18.3, s.47): supplier name, contract date, description, itemized and total price, return/cancellation/refund policies; given before contract above a prescribed amount (the amount: UNVERIFIED). Online: the info must be retainable/printable and the consumer must have a chance to correct errors and accept or decline. https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/04002_04
- Copy of contract: within 15 days after the contract is made (s.48(1)); email is deemed received on the 3rd day after sending (s.48(4)). https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/04002_04
- Cancellation: 7 days after receiving the copy if required info is missing or inconsistent (s.18.4(2)(c)); up to 30 days after the contract if no copy is given (s.49(1)(b)); cancel before delivery if not delivered within 30 days of the supply date (or of the contract date if none stated) (s.49(1)(c)-(d)). There is NO general 7-day cooling-off for a compliant contract. https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/04002_04
- Refund: all money, no deduction, within 15 days after cancellation notice (or goods returned) (s.50). If not refunded, the consumer can ask the card issuer to reverse the charge (s.52). https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/04002_04
- Future performance contract (s.17): supply or full payment is not made when the contract is made. A deposit for workbooks delivered weeks later likely qualifies (also a distance sales contract); copy within 15 days (s.23(3)); cancel within 1 year if info missing (s.18.4(2)(a)); cancel any time before delivery if not delivered within 30 days of the supply date (s.23(5)(b)). Low-value contracts are excluded (threshold UNVERIFIED). Whether the deposit is itself the "contract": judgement, get legal advice. https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/04002_04
- Consumer Protection BC page for plain-language summary: not fetched (404). UNVERIFIED. https://www.consumerprotectionbc.ca

## Bottom line
1. Use Stripe Payment Links: CA$25 costs about CA$1.03, no monthly fee, supports email prefill, `client_reference_id`, session ID in the redirect, and saved cards. https://stripe.com/en-ca/pricing
2. Do not rely on a card hold: 7 days standard, 30 days extended with limits. Save the card (Payment Link "save payment details") and charge or subscribe at shipping. https://docs.stripe.com/payments/place-a-hold-on-a-payment-method
3. Credit the deposit with a negative customer balance transaction, which auto-applies to the first invoice. Do not enable Checkout invoice_creation. https://docs.stripe.com/billing/customer/balance
4. Skip Shopify (CAD 49+/mo, deposits need apps, fights a custom form). Square (2.8% + 30c) and Helcim (interchange-plus, 0.4% recurring) work but give less control over deposit-to-subscription. https://www.shopify.com/ca/pricing
5. Before launch: confirm Stripe's sole-proprietor fields and reserve risk (UNVERIFIED), refund fees are not returned, and send a BC-compliant contract copy within 15 days with refund/cancellation terms. https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/04002_04
