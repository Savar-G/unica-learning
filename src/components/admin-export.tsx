// The admin export page (#200): one CSV and one JSON file per dataset of the raw test data. A server component with no
// JavaScript: each file is a plain download link, and "with test families" is a GET form, as the template table.
import Link from "next/link";
import { Fragment } from "react";
import { Table } from "@/components/admin";
import { ADMIN_EXPORT_PATH, EXPORT_DATASETS, EXPORT_FORMATS, exportHref } from "@/lib/admin-export";
import { anonymousCopiesHref } from "@/lib/anonymous-copy-export";
import { ADMIN_PATH } from "@/lib/admin-view";

export function ExportView({ withTests, demo }: { withTests: boolean; demo: boolean }) {
  return (
    <>
      <p className="adm-lead">The raw test data, one file per dataset. The CSV opens in a spreadsheet; the JSON keeps every value as stored. Each file joins to the others by the test id (assessment_id) and the place in the test (position).</p>
      <form className="adm-filters" action={ADMIN_EXPORT_PATH} method="get" aria-label="Filters">
        {demo && <input type="hidden" name="demo" value="1" />}
        <label className="adm-check"><input type="checkbox" name="tests" value="1" defaultChecked={withTests} /> Include team and test families</label>
        <button type="submit" className="btn adm-btn">Apply</button>
      </form>
      <p className="adm-note">{withTests ? "Every family, with the team and test families." : "Real families only: the team and test families are left out."}</p>
      <Table label="Datasets" head={["Dataset", "One row is", "Download"]} empty="No datasets.">
        {EXPORT_DATASETS.map((d) => (
          <tr key={d.id}>
            <td className="adm-nowrap">{d.label}<span className="adm-sub adm-mono">{d.id}</span></td>
            <td>{d.row.charAt(0).toUpperCase() + d.row.slice(1)}</td>
            <td className="adm-nowrap">
              {EXPORT_FORMATS.map((format, i) => (
                <Fragment key={format}>
                  {i > 0 && " · "}
                  <a href={exportHref({ dataset: d.id, format, withTests }, demo)} download>{format.toUpperCase()}</a>
                </Fragment>
              ))}
            </td>
          </tr>
        ))}
        {/* #201, D-119: the copies kept when a family is deleted. Their own table and route: no ids, so they join to nothing. */}
        <tr>
          <td className="adm-nowrap">Copies without names<span className="adm-sub adm-mono">anonymous_tests</span></td>
          <td>A question shown in a test copied before its family was deleted (CSV), or a whole copy (JSON). No names or ids: it joins to no other file.</td>
          <td className="adm-nowrap">
            {EXPORT_FORMATS.map((format, i) => (
              <Fragment key={format}>
                {i > 0 && " · "}
                <a href={anonymousCopiesHref({ format, withTests })} download>{format.toUpperCase()}</a>
              </Fragment>
            ))}
          </td>
        </tr>
      </Table>
      <ul className="adm-list adm-note">
        <li>No names, emails or postal codes. Each row has the parent and child ids instead: open a family from <Link href={`${ADMIN_PATH}/parents`}>Parents</Link>.</li>
        <li>Drawings and whiteboard strokes are their paths in the private storage bucket, not the files.</li>
        <li>CSV: UTF-8 with a byte order mark, so Excel reads accents. Nested values are JSON text in one cell, and an empty cell is no value. A text cell that a spreadsheet would run as a formula starts with an apostrophe. A spreadsheet cell holds up to 32,767 characters, so the learner profile has one column per part. A spreadsheet may show a number its own way (137.00 as 137); the JSON has the stored text.</li>
        <li>Each file is read and sent a page at a time. A large dataset takes a while; a download that stops early ends with an error, never as a shorter file.</li>
      </ul>
    </>
  );
}
