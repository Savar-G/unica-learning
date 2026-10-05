import { PhoneScan } from "ai-workbooks-landing-page";

export const Scanned = () => (
  <div style={{ width: 360, height: 220, borderRadius: 4, overflow: "hidden" }}><PhoneScan /></div>
);
export const Capturing = () => (
  <div style={{ width: 360, height: 220, borderRadius: 4, overflow: "hidden" }}><PhoneScan done={false} /></div>
);
