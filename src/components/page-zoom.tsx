"use client";
// Tap a sample page to read it full size (round r18). A native <dialog>: Esc closes it, focus returns to the thumbnail.
// The page scales with its box (container units), so the same markup is the thumbnail and the large view.
import { useRef, type ReactNode } from "react";
import { track } from "@/lib/track";

export function PageZoom({ name, id, children }: { name: string; id: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = () => {
    ref.current?.showModal();
    track("page_zoom", { src: id });
  };
  return (
    <>
      <button type="button" className="pz-zoom" onClick={open} aria-label={`See ${name}'s page full size`}>
        {children}
      </button>
      <dialog
        ref={ref}
        className="pz-dialog"
        aria-label={`${name}'s page`}
        onClick={(e) => {
          if (e.target === e.currentTarget) ref.current?.close();
        }}
      >
        <div className="pz-dialog-bar">
          <span>{name}&apos;s page</span>
          <button type="button" className="pz-dialog-close" onClick={() => ref.current?.close()} aria-label="Close">
            ×
          </button>
        </div>
        <div className="pz-dialog-page">{children}</div>
      </dialog>
    </>
  );
}
