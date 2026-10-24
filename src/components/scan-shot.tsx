// How it works, step 4 (Scan): the photo of a phone, with Leah's finished page on its screen as the app marks it. One
// answer is wrong with the usual borrowing slip, so the picture shows the marking, the gap and the solution together.
// The photo is portrait and the card crops it like object-fit: cover; the frame below is the whole photo, centred the
// same way, so the screen sits at fixed percentages of it at any card width.
import Image from "next/image";
import scanPhoto from "@/assets/img/loop-scan.jpg";
import "./scan-shot.css";

const SUMS: { a: string; b: string; op: "+" | "−"; wrote: string; right: boolean }[] = [
  { a: "27", b: "39", op: "+", wrote: "66", right: true },
  { a: "54", b: "37", op: "−", wrote: "23", right: false },
  { a: "408", b: "168", op: "+", wrote: "576", right: true },
];

export function ScanShot({ sizes }: { sizes: string }) {
  return (
    <div className="scan-frame">
      <Image src={scanPhoto} alt="" sizes={sizes} placeholder="blur" />
      <div className="scan-screen" role="img" aria-label="A phone shows Leah's marked page: 27 + 39 = 66 and 408 + 168 = 576 are right; 54 − 37 = 23 is wrong, and the app shows how to borrow a ten to get 17.">
        <p className="scan-bar"><b>2 of 3 right</b><span>Gap: borrowing</span></p>
        <div className="scan-sheet" aria-hidden>
          <p className="scan-tt">Regrouping in stories</p>
          <div className="scan-sums">
            {SUMS.map((s) => (
              <div key={s.a} className={`scan-sum${s.right ? "" : " is-wrong"}`}>
                <span>{s.a}</span>
                <span>{s.op} {s.b}</span>
                <span className="scan-wrote">{s.wrote}</span>
                <i>{s.right ? "✓" : "✗"}</i>
              </div>
            ))}
          </div>
          <p className="scan-fix">Borrow a ten: 14 − 7 = 7, 4 − 3 = 1, <b>so 17</b></p>
        </div>
      </div>
    </div>
  );
}
