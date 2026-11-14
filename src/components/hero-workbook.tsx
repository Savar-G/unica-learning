// Home hero visual (D-214, prototype r30 B; panel from prototype r31 A, D-215): a sample workbook cover, made for one
// child, on top of a workbook page, inside a grainy colour panel that runs off the page edge.
// The cover follows the real sample cover (public/whats-included/wb/leah-01-cover.jpg), rebuilt in HTML at 880 px wide
// so it stays sharp at any size. D-340: its title is the real Level U14 cover title, "Multiplying and dividing" (src/lib/workbook-cover-titles.ts), a term every parent knows; a parent
// on the 2026-11-11 call did not know "borrowing".
import Image from "next/image";

const NAME = "Leah";

function Cover({ name }: { name: string }) {
  const whose = /s$/i.test(name) ? `${name}'` : `${name}'s`;
  return (
    <div className="hwb-cover">
      <div className="hwb-cover-top"><span className="hwb-wm">Unica Learning<i /></span><span className="hwb-mono">Workbook 01 · 10 days</span></div>
      <div className="hwb-cover-mk">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
      <p className="hwb-cover-for">Made for <b>{name}</b> · Level U14 · Multiplying and dividing</p>
      <p className="hwb-cover-t">Multiplying and<br /><mark>dividing</mark></p>
      <div className="hwb-cover-box">
        <span className="hwb-mono">Made from {whose} assessment</span>
        <p>On Sep 22, {name} knew her times tables but slowed down when dividing. So this workbook:</p>
        <ul>
          <li>Practises dividing, one step at a time</li>
          <li>Keeps multiplying fresh every day</li>
          <li>Ends with one step ahead: word problems with both</li>
        </ul>
      </div>
      <div className="hwb-cover-foot">
        <span className="hwb-qr" />
        <span className="hwb-mono">UL · {name.toUpperCase()} · W01 · COVER</span>
        <span className="hwb-wm sm">Unica Learning<i /></span>
      </div>
    </div>
  );
}

export function HeroWorkbook() {
  return (
    <div className="hwb-panel" role="img" aria-label="A sample Unica workbook cover made for Leah, on top of a workbook page">
      <div className="hwb-book" aria-hidden="true">
        <div className="hwb-sheet hwb-back">
          <Image src="/whats-included/wb/leah-04-d1p2.jpg" alt="" width={880} height={1139} sizes="460px" loading="eager" />
        </div>
        <div className="hwb-sheet hwb-page"><Cover name={NAME} /></div>
        <i className="hwb-fold" />
      </div>
    </div>
  );
}
