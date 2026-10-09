"use client";

import { useEffect, useRef, useState } from "react";

// Phones show the first six FAQ questions (D-072); this button reveals the rest.
// The cut starts only after hydration ("faq-cut"), so without JavaScript every question shows.
// Wider screens hide the button and always show every question (see warm.css).
export function FaqMore() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    ref.current?.closest("section")?.classList.add("faq-cut");
  }, []);
  if (open) return null;
  return (
    <button
      ref={ref}
      type="button"
      className="btn ghost faq-more"
      aria-controls="faq"
      onClick={(e) => {
        const faq = e.currentTarget.closest("section");
        faq?.classList.add("faq-all");
        setOpen(true);
        // Keep the reader in place: focus the first newly shown question.
        requestAnimationFrame(() => faq?.querySelectorAll<HTMLElement>(".faq summary")[6]?.focus());
      }}
    >
      More questions
    </button>
  );
}
