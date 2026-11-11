import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/** Accept a complete Canadian or US number without an extension. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 40 || !/^[+\d\s().-]+$/.test(raw)) return null;
  const number = parsePhoneNumberFromString(raw, { defaultCountry: "CA", extract: false });
  return number && !number.ext && (number.country === "CA" || number.country === "US") && number.isValid() ? number.number : null;
}
