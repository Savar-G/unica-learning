# Browser verification

Verified on the Mac with Aside `--account u0`, using `npm run dev -- --port 3046` on 2026-11-11.

The report belonged to an existing Savar-owned family marked in `public.test_accounts`. No real parent data was opened. No email, call, or booking was made. Temporary login material stayed outside the repository. The check tabs were closed.

- Signup: a partial phone number was rejected beside the field. Focus moved to the phone field. The form stayed before the email-code step. This check did not create a family.
- Report: rejected optional cookies yielded zero calendar frames. Acceptance created one frame. The live frame body and screenshot showed the booking page, event name, calendar month, available dates, and its own cookie-settings control.
- Consent withdrawal: the frame count returned to zero. The fallback booking link stayed present, once.
- Desktop: the report card contains the calendar and fallback link. The frame uses no-referrer. Its URL contains no family data.
- Phone, 390 pixels: the live frame rendered inside the report. The page had no horizontal overflow. The existing plan bar remained visible. The calendar has its own scroll area.
- Tool limit: the iframe heading locator timed out. Reading the frame body and inspecting screenshots confirmed that the calendar loaded. The timeout was not used as successful render evidence.
- Failure and missing URL: source and unit evidence cover URL rejection and the always-visible fallback. A live provider failure and an empty production booking variable were not induced.

Evidence: `.design/evidence/phone-results-call/calendar-desktop.png` and `calendar-phone.png`.
The full test gate passed before the final privacy disclosure and sitemap date corrections. A final gate and independent reviews are pending at this checkpoint.
