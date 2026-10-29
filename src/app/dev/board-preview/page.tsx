import { notFound } from "next/navigation";
import { BoardPreview } from "./preview";

// Dev-only: the real test desk with two sample questions, to look at the collapsible whiteboard. Not in production.
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BoardPreview />;
}
