import { gradeName } from "@/lib/workbook-instructions";

export function AdminWorkbookPlacement({ measuredLevel, startingPoint }: {
  measuredLevel: number | null;
  startingPoint: string | null;
}) {
  return <p>
    <strong>Measured level</strong> {measuredLevel === null ? "Unavailable" : gradeName(measuredLevel)}
    {" · "}
    <strong>Starting point</strong> {startingPoint ?? "Unavailable"}
  </p>;
}
