// The admin flyers page (door-to-door A/B test): the verdict on top, flyer A against flyer B as two bars per measure,
// then the numbers side by side with the "handed out" counts to type in. How the test is set up and run sits in a closed
// section. Server component; only the "handed out" number is a form (admin-flyers-form.tsx).
import type { ReactNode } from "react";
import { SectionHead } from "@/components/admin-blocks";
import { at } from "@/lib/admin-dashboard";
import { flyerMetrics } from "@/lib/admin-pages";
import type { FlyerPage } from "@/lib/flyer-store";
import { FLYERS, flyerUrl, MIN_SIGNUPS, per100, TARGET_SIGNUPS, type FlyerRow } from "@/lib/flyers";
import { DeliveredForm } from "./admin-flyers-form";
import "./admin-pages.css";

const n = (v: number) => v.toLocaleString("en-CA");
const rate = (v: number | null) => (v === null ? "Enter handed out" : String(v));

export function FlyersView({ d }: { d: FlyerPage }) {
  const [a, b] = d.rows;
  const metrics = flyerMetrics(a, b);
  const line = (label: string, hint: string | null, cell: (r: FlyerRow) => ReactNode) => (
    <tr>
      <th scope="row">{label}{hint && <span className="adm-sub">{hint}</span>}</th>
      <td className="adm-num">{cell(a)}</td>
      <td className="adm-num">{cell(b)}</td>
    </tr>
  );
  const leading = d.verdict.status === "clear" || d.verdict.status === "leaning";
  return (
    <>
      {!d.ready && (
        <p className="ab-needs" role="alert">
          <b>Needs you:</b> Flyer tracking is not set up. Scans are not counted yet, so the scan numbers are zero. Signups are still tagged by the QR address, so they appear here once it is set up.
        </p>
      )}
      <p className={`ap-verdict${leading ? " is-lead" : ""}`} role="status"><b>Verdict:</b> {d.verdict.text}</p>

      <section className="ap-card" aria-labelledby="ap-ab">
        <SectionHead id="ap-ab" title="A against B" line="Signups per 100 flyers decides the test. The other measures show where each flyer's families stop." />
        <ul className="ap-ab-key">
          <li><span className="ap-ab-sw is-a" aria-hidden="true" />{FLYERS.a.name}: {FLYERS.a.headline}</li>
          <li><span className="ap-ab-sw is-b" aria-hidden="true" />{FLYERS.b.name}: {FLYERS.b.headline}</li>
        </ul>
        <figure className="ap-ab-fig" role="img" aria-label={metrics.map((m) => `${m.label}: Flyer A ${m.a.text}, Flyer B ${m.b.text}`).join("; ")}>
          <dl className="ap-ab">
            {metrics.map((m) => (
              <div key={m.key}>
                <dt>{m.label}</dt>
                {(["a", "b"] as const).map((code) => (
                  <dd key={code} className={`is-${code}${m.lead === code ? " is-lead" : ""}`}>
                    <span>{code.toUpperCase()}</span>
                    <span className="ap-ab-bar"><i style={{ width: `${m[code].width}%` }} /></span>
                    <span className="ap-ab-n">{m[code].text}</span>
                  </dd>
                ))}
              </div>
            ))}
          </dl>
        </figure>
        {metrics[0].a.value === null || metrics[0].b.value === null ? <p className="adm-note ap-foot">Scans per 100 flyers shows once both handed-out counts are entered below.</p> : null}
      </section>

      <SectionHead id="ap-flyer-numbers" title="The numbers" line="Type how many of each flyer you handed out after each round of doors." />
      <div className="adm-scroll" role="region" aria-label="Flyer numbers" tabIndex={0}>
        <table className="adm-table ap-flyer-table">
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col" className="adm-num">{FLYERS.a.name}</th>
              <th scope="col" className="adm-num">{FLYERS.b.name}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Handed out<span className="adm-sub">Type it in after each round of doors</span></th>
              <td><DeliveredForm code="a" delivered={a.delivered} /></td>
              <td><DeliveredForm code="b" delivered={b.delivered} /></td>
            </tr>
            {line("Scans", "Raw count: one person scanning twice counts twice", (r) => n(r.scans))}
            {line("Scans per 100 flyers", null, (r) => rate(per100(r.scans, r.delivered)))}
            {line("Signups", "Families who made an account from this flyer", (r) => n(r.accounts))}
            {line("Signups per 100 flyers", "The number that decides the test", (r) => rate(per100(r.accounts, r.delivered)))}
            {line("Started the test", null, (r) => n(r.started))}
            {line("Finished the test", null, (r) => n(r.finished))}
            {line("Saved a card", null, (r) => n(r.cardSaved))}
            {line("Paying", null, (r) => n(r.paying))}
            {line("Last scan", null, (r) => (d.lastScan[r.code] ? at(d.lastScan[r.code]) : "-"))}
          </tbody>
        </table>
      </div>

      <details className="adm-tech ap-setup">
        <summary>How the test is set up and run</summary>
        <p>
          Two flyers, two QR codes. Each QR code opens its own address, which counts the scan and sends the parent to the home page,
          tagged with the flyer. The tag goes with them when they tap &quot;Take free assessment&quot;, and a signup keeps its flyer, so the numbers
          follow each family from the door to a saved card. A parent who browses to another page first and starts from there is not tagged.
        </p>
        <h3>Print these addresses as the QR codes</h3>
        <ul className="adm-list">
          <li>{FLYERS.a.name} ({FLYERS.a.look}): <span className="adm-mono">{flyerUrl("a")}</span></li>
          <li>{FLYERS.b.name} ({FLYERS.b.look}): <span className="adm-mono">{flyerUrl("b")}</span></li>
        </ul>
        <h3>Running it fairly</h3>
        <ul className="adm-list">
          <li>Alternate A and B house by house on the same streets, in the same hours. Do not give A to one street and B to another.</li>
          <li>Hand out about the same number of each, and type the counts in above. Everything is shown per 100 flyers, so a few more of one is fine.</li>
          <li>Do not change a flyer, the price or the offer during the test. Start a new test if you do.</li>
          <li>Judge by signups per 100 flyers, not scans: scans include people who looked and left, and repeat scans. The page says nothing under {MIN_SIGNUPS} signups in total, and only calls a winner at {TARGET_SIGNUPS}. Decide the target before you start, and do not stop early because one flyer looks ahead.</li>
          <li>{d.withTests ? "Test families are counted, because Show test families is on." : "Test families are left out. Show test families, at the bottom of the menu, counts them too."}</li>
        </ul>
      </details>
    </>
  );
}
