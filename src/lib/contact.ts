export const BUSINESS_NAME = "Unica Learning";
/** The mailing address that CASL requires in the reminder emails (#56, #73). */
export const MAILING_ADDRESS = "16557 87A Ave, Surrey, BC V4N 5B2";
export const WEBSITE = "unicalearning.com";
export const SUPPORT_EMAIL = "contact@unicalearning.com";
export const SUPPORT_HREF = `mailto:${SUPPORT_EMAIL}`;
/**
 * The free 15-minute results call with a founder, booked on Calendly: offered on the report and in the report email.
 * Calendly emails each booking to the account owner (contact@unicalearning.com). NEXT_PUBLIC_BOOKING_URL overrides it;
 * set it to an empty value to stop offering the call.
 */
export const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL ?? "https://calendly.com/contact-unicalearning/15min";
