import { Mailer } from "ai-workbooks-landing-page";

export const ArrivingBook = () => (
  <div style={{ width: 360, height: 220, borderRadius: 4, overflow: "hidden" }}><Mailer /></div>
);
export const ReadingBook = () => (
  <div style={{ width: 360, height: 220, borderRadius: 4, overflow: "hidden" }}><Mailer name="Arjun" book={2} subject="Reading" /></div>
);
