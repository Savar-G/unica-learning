// The admin flyers page (door-to-door A/B test): per-flyer numbers side by side, and a plain verdict. Server component;
// only the "handed out" number is a form (admin-flyers-form.tsx).
import type { ReactNode } from "react";
import { at } from "@/lib/admin-dashboard";
import type { FlyerPage } from "@/lib/flyer-store";
import { FLYERS, flyerUrl, MIN_SIGNUPS, per100, TARGET_SIGNUPS, type FlyerRow } from "@/lib/flyers";
import { DeliveredForm } from "./admin-flyers-form";

const n = (v: number) => v.toLocaleString("en-CA");
const rate = (v: number | null) => (v === null ? "Enter handed out" : String(v));

export function FlyersView({ d }: { d: FlyerPage }) {
  const [a, b] = d.rows;
  const line = (label: string, hint: string | null, cell: (r: FlyerRow) => ReactNode) => (
    <tr>
      <th scope="row">{label}{hint && <span className="adm-sub">{hint}</span>}</th>
      <td className="adm-num">{cell(a)}</td>
      <td className="adm-num">{cell(b)}</td>
    </tr>
  );
  return (
    <>
      <p className="adm-lead">
        Two flyers, two QR codes. Each QR code opens its own address, which counts the scan and sends the parent to the home page,
        tagged with the flyer. The tag goes with them when they tap &quot;Take free assessment&quot;, and a signup keeps its flyer, so the funnel below
        follows each family from the door to a saved card. A parent who browses to another page first and starts from there is not tagged.
      </p>

      {!d.ready && (
        <p className="adm-note" role="alert">
          The flyer tables are not set up in the database yet, so scans are not being counted and the numbers below are zero. Apply
          <code> supabase/migrations/20261016_add_flyer_tracking.sql</code>, then reload. Signups are still tagged by the QR address, so they appear here once the tables exist.
        </p>
      )}

      <p className="adm-note" role="status">
        {d.verdict.text}
      </p>

      <div className="adm-scroll">
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col" className="adm-num">{FLYERS.a.name}<span className="adm-sub">{FLYERS.a.headline}</span></th>
              <th scope="col" className="adm-num">{FLYERS.b.name}<span className="adm-sub">{FLYERS.b.headline}</span></th>
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

      <h2>Print these addresses as the QR codes</h2>
      <ul className="adm-list">
        <li>{FLYERS.a.name}: <span className="adm-mono">{flyerUrl("a")}</span></li>
        <li>{FLYERS.b.name}: <span className="adm-mono">{flyerUrl("b")}</span></li>
      </ul>

      <h2>Running it fairly</h2>
      <ul className="adm-list">
        <li>Alternate A and B house by house on the same streets, in the same hours. Do not give A to one street and B to another.</li>
        <li>Hand out about the same number of each, and type the counts in above. Everything is shown per 100 flyers, so a few more of one is fine.</li>
        <li>Do not change a flyer, the price or the offer during the test. Start a new test if you do.</li>
        <li>Judge by signups per 100 flyers, not scans: scans include people who looked and left, and repeat scans. The page says nothing under {MIN_SIGNUPS} signups in total, and only calls a winner at {TARGET_SIGNUPS}. Decide the target before you start, and do not stop early because one flyer looks ahead.</li>
        <li>
          {d.withTests ? "Team and test families are counted." : "Team and test families are left out."}{" "}
          <a href={d.withTests ? "?" : "?tests=1"}>{d.withTests ? "Leave them out" : "Count them too"}</a>
        </li>
      </ul>
    </>
  );
}
