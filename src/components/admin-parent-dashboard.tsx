"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PARENT_PREVIEW_VIEWS, PREVIEW_FAMILIES, PREVIEW_SIZES, previewSelection, previewUrl, sampleChildren, selectedScenario, type PreviewSelection } from "@/lib/admin-parent-dashboard";
import "./admin-parent-dashboard.css";

export function AdminParentDashboard({ selection }: { selection: PreviewSelection }) {
  const router = useRouter();
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [document, setDocument] = useState<{ key: string; html: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const key = previewUrl(selection);
  const size = PREVIEW_SIZES[selection.size];
  const currentView = PARENT_PREVIEW_VIEWS.find(v => v.id === selection.view)!;
  const child = sampleChildren(selection)[selection.child === "second" ? 1 : 0];
  const select = (change: Partial<PreviewSelection>) => router.replace(previewUrl(previewSelection({ ...selection, ...change })), { scroll: false });

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    const resize = () => setScale(Math.min(1, box.clientWidth / size.width));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(box);
    return () => observer.disconnect();
  }, [size.width]);

  useEffect(() => {
    let active = true;
    // Import only for this Admin surface. Static rendering never mounts a parent component, so its effects cannot run.
    void import("@/components/admin-parent-preview").then(({ renderParentPreview }) => {
      const page = window.document;
      const html = renderParentPreview(selection, {
        origin: window.location.origin, className: page.documentElement.className,
        links: Array.from(page.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map(link => link.href),
        inline: Array.from(page.querySelectorAll("style")).map(style => style.textContent ?? ""),
      });
      if (active) { setDocument({ key, html }); setFailed(false); }
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [key, selection]);

  // The same-origin token permits local fonts. The sandbox never permits scripts, forms, downloads or top navigation.
  return <div className="apd">
    <p className="adm-note">Synthetic family data. Preview only. Buttons and account links are read-only. Use the controls to change the view.</p>
    <form className="adm-filters apd-controls" onSubmit={event => event.preventDefault()} aria-label="Parent dashboard preview controls">
      <label>View<select value={selection.view} onChange={event => select({ view: event.target.value as PreviewSelection["view"], scenario: "" })}>{PARENT_PREVIEW_VIEWS.map(view => <option key={view.id} value={view.id}>{view.label}</option>)}</select></label>
      <label>Scenario<select value={selection.scenario} onChange={event => select({ scenario: event.target.value })}>{currentView.scenarios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
      <label>Screen size<select value={selection.size} onChange={event => select({ size: event.target.value as PreviewSelection["size"] })}>{Object.entries(PREVIEW_SIZES).map(([id, value]) => <option key={id} value={id}>{value.label} ({value.width} px)</option>)}</select></label>
      <label>Family<select value={selection.family} onChange={event => select({ family: event.target.value as PreviewSelection["family"] })}>{Object.entries(PREVIEW_FAMILIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      {selection.family === "two" && <label>Child<select value={selection.child} onChange={event => select({ child: event.target.value as PreviewSelection["child"] })}><option value="first">Leah</option><option value="second">Kai</option></select></label>}
    </form>
    <p className="adm-note" role="status">{currentView.label}: {selectedScenario(selection).label}. {child ? `Stage: ${child.stage}. Tabs: ${child.tabs.join(", ")}.` : "No children."} {Math.round(scale * 100)}% of {size.width} × {size.height} px.</p>
    <div className="apd-frame-host" ref={host}>
      <div className="apd-frame-space" style={{ width: size.width * scale, height: size.height * scale }}>
        {failed ? <p role="alert">The preview could not load. Select the view again.</p> : document?.key === key ? <iframe title={`${currentView.label}: ${selectedScenario(selection).label}. Read-only parent preview.`} srcDoc={document.html} sandbox="allow-same-origin" referrerPolicy="no-referrer" width={size.width} height={size.height} style={{ transform: `scale(${scale})` }} /> : <p role="status">Loading preview...</p>}
      </div>
    </div>
    <details className="apd-limits"><summary>Coverage and limits</summary>
      <p>These samples include implemented tabs even when their family release switches are off. This page changes no release switch.</p>
      <p>Page history, answer corrections, solutions, future progress charts, and plan details that have no implemented parent view are not shown (#458, #470, #565).</p>
      <p>Use the Scenario control for open confirmations and error states. The frame permits scrolling and native text disclosures. It cannot send data, open an account, use a camera, or download a file.</p>
    </details>
  </div>;
}
