import { readFile } from "node:fs/promises";
import { notFound } from "next/navigation";
import { ResultsFixture } from "./fixture";

export default async function ResultsQaPage({ searchParams }: { searchParams: Promise<{ scenario?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const image = await readFile(`${process.cwd()}/.design/experiments/r-page-results/synthetic-photo.jpg`);
  return <main style={{ maxWidth: 604, padding: "28px 22px", margin: "0 auto", background: "white" }}><style>{"nextjs-portal { display: none; }"}</style><ResultsFixture image={`data:image/jpeg;base64,${image.toString("base64")}`} scenario={(await searchParams).scenario ?? "ready"} /></main>;
}
