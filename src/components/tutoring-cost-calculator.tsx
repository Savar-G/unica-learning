"use client";

import { useState } from "react";
import { cad } from "@/lib/site";
import { tutoringCost } from "@/lib/tutoring-cost";

const FIELDS = [
  { key: "hourlyRate", label: "Hourly rate (CAD)", min: 0, max: 1000, step: "0.01" },
  { key: "hoursPerWeek", label: "Hours each week", min: 0.25, max: 40, step: "0.25" },
  { key: "weeks", label: "Number of weeks", min: 1, max: 52, step: "1" },
  { key: "extraFees", label: "Total extra fees (CAD)", min: 0, max: 10000, step: "0.01" },
] as const;

export function TutoringCostCalculator() {
  const [values, setValues] = useState({ hourlyRate: "60", hoursPerWeek: "1", weeks: "4", extraFees: "0" });
  const result = Object.values(values).some((v) => v.trim() === "") ? null : tutoringCost({
    hourlyRate: Number(values.hourlyRate), hoursPerWeek: Number(values.hoursPerWeek), weeks: Number(values.weeks), extraFees: Number(values.extraFees),
  });
  return (
    <div className="res-card-box" data-tone="sky">
      <p>Enter a quote for one child. Include registration, materials and travel charges in the total extra fees. These are example inputs, not a tutor&apos;s quote.</p>
      <div className="tutor-cost-fields">
        {FIELDS.map(({ key, label, ...limits }) => (
          <div className="fld" key={key}>
            <label htmlFor={`tutor-${key}`}>{label}</label>
            <input id={`tutor-${key}`} type="number" inputMode="decimal" {...limits} required value={values[key]} onChange={(event) => setValues({ ...values, [key]: event.target.value })} aria-describedby="tutor-cost-help" />
          </div>
        ))}
      </div>
      <p id="tutor-cost-help" className="small">Use 1-52 whole weeks and 0.25-40 hours per week, in steps of 0.25 hours. Rates: CAD 0-1,000. Extra fees: CAD 0-10,000. Enter money in whole cents. Add any applicable tax to the quote first. Four weeks is not a calendar month.</p>
      <div role="status" aria-live="polite" aria-atomic="true">
        {result ? <p><strong>Total for {values.weeks} weeks: CAD {cad(result.total)}.</strong> Lessons: CAD {cad(result.lessons)}. Extra fees: CAD {cad(Number(values.extraFees))}.</p> : <p>Enter a valid number in each field to see the total.</p>}
      </div>
      <p className="small">Calculation: hourly rate × hours each week × weeks + total extra fees. Amounts are rounded to cents. The calculator uses only the numbers you enter.</p>
      <noscript><p>To calculate without JavaScript, multiply the hourly rate by the hours each week and the number of weeks. Then add the extra fees.</p></noscript>
    </div>
  );
}
