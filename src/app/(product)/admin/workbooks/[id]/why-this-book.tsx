import { Table } from "@/components/admin";
import type { WorkbookWhy } from "@/lib/workbook-why";

export function WhyThisBook({ why }: { why: WorkbookWhy | null }) {
  return <section aria-labelledby="why-this-book-title">
    <h2 id="why-this-book-title">Why this book</h2>
    {!why ? <p>No explanation was saved for this book. Older books keep their original plan.</p> : <>
      <p>{why.start}</p>
      <h3>Inputs</h3>
      <p>Clear means one more right or wrong answer would not change the result. Early sign means one more answer could change it.</p>
      <p>A topic can look secure after only 1 to 3 test questions. We still teach it from step 1 because that evidence is limited. Only a clear secure result can skip first-book teaching.</p>
      <Table label="Inputs to this book" head={["Input", "What it said", "Evidence", "Use", "Reason"]} empty="No inputs recorded.">
        {why.inputs.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.value}</td><td>{row.reliability}</td><td>{row.status}</td><td>{row.reason}</td></tr>)}
      </Table>
      <h3>What shaped each page</h3>
      <p>These are plan choices. Question wording and the final page fit are checked when the book is made.</p>
      <Table label="Page choices" head={["Page", "Plan choices"]} empty="No pages planned.">
        {why.pages.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td><ul>{row.choices.map(choice => <li key={choice}>{choice}</li>)}</ul></td></tr>)}
      </Table>
      <h3>Warnings and shortfalls</h3>
      {why.warnings.length ? <ul>{why.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : <p>No warnings or shortfalls in this plan.</p>}
    </>}
  </section>;
}
