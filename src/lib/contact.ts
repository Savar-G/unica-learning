export const BUSINESS_NAME = "Unica Learning";
/** The mailing address that CASL requires in the reminder emails (#56, #73). */
export const MAILING_ADDRESS = "16557 87A Ave, Surrey, BC V4N 5B2";
/** The display name of the emails the founders sign (D-225): the report and the last start reminder. */
export const FOUNDERS_SENDER_NAME = "Savar & Cedric from Unica Learning";
export const WEBSITE = "unicalearning.com";
export const SUPPORT_EMAIL = "contact@unicalearning.com";
export const SUPPORT_HREF = `mailto:${SUPPORT_EMAIL}`;
/**
 * The free 15-minute results call with a founder, booked on Cal.com: offered on the report and in the report email.
 * Cal.com emails each booking to the account owner (contact@unicalearning.com). NEXT_PUBLIC_BOOKING_URL overrides it;
 * set it to an empty value to stop offering the call.
 */
export const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL ?? "https://cal.com/unicalearning/15min";

/** A booking link without prefilled data, on Cal.com or (the old page) Calendly only. */
const BOOKING_HOSTS = new Set(["cal.com", "calendly.com"]);

export function safeBookingUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !BOOKING_HOSTS.has(url.hostname) || url.username || url.password) return "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch { return ""; }
}
