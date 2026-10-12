"use client";

// Throwaway copy review on the existing layout. All former variant URLs show this revision.
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";

export function HeroPrototype({ children, revised }: { children: ReactNode; revised: ReactNode }) {
  const params = useSearchParams();
  return process.env.NODE_ENV !== "production" && params.has("variant") ? revised : children;
}
