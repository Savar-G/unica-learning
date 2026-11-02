"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { browserClient } from "@/lib/supabase-browser";
import Image from "next/image";
import { prepareScanPhoto } from "@/lib/scan-photo-browser";
import "./scan-pages.css";

type Photo = { id: string; child_id: string; state: string; child?: string; book?: number; day?: string; page?: number; expires_at: string };
const errorText: Record<string, string> = {
  qr: "We cannot read the page code. Take another photo with the whole page and its QR code in view.",
  page: "This page is not in this child's shipped workbook. Check the child and take another photo.",
  duplicate: "This page already has a photo. Open the saved photo below. Delete it first if you need another photo.",
  size: "This photo is too large. Choose a photo smaller than 20 MB.",
  image: "We cannot read this photo. Try a JPG, PNG, or WebP photo with the whole page in view.",
  busy: "Another photo is still uploading. Wait a moment, then try again.",
  frequency: "You have sent too many photos. Wait a while, then try again.",
  quota: "Your family's photo storage is full. Delete older photos, then try again after we remove the files.",
  uncertain: "We cannot confirm the upload yet. Use Check upload before you send another photo.",
};

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "unavailable");
  return data;
}

export function ScanPages({ childrenList, parent }: { childrenList: { id: string; first_name: string }[]; parent: string }) {
  const [child, setChild] = useState(childrenList[0]?.id ?? "");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [current, setCurrent] = useState<Photo | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [recoverable, setRecoverable] = useState(false);
  const upload = useRef<{ id: string } | null>(null);
  const epoch = useRef(0);
  const invalidate = useCallback(() => { epoch.current++; }, []);
  const imageUrl = useRef<string | null>(null);
  const clearImage = useCallback(() => {
    if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
    imageUrl.current = null;
    setImage(null);
  }, []);
  const list = useCallback(async () => {
    const version = epoch.current;
    const data = await api(`/api/account/scans?child=${child}`);
    if (version === epoch.current) setPhotos(data.photos.filter((p: Photo) => ["pending", "saved"].includes(p.state)));
  }, [child]);

  useEffect(() => {
    const { data } = browserClient().auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== parent) {
        epoch.current++; clearImage(); setCurrent(null); setPhotos([]); upload.current = null;
        setFailed(true); setMessage("Your account changed. Sign in again to view photos.");
      }
    });
    const hide = () => { epoch.current++; clearImage(); };
    window.addEventListener("pagehide", hide);
    return () => { invalidate(); data.subscription.unsubscribe(); window.removeEventListener("pagehide", hide); clearImage(); };
  }, [parent, clearImage, invalidate]);

  useEffect(() => {
    if (child) void list().catch(() => { setFailed(true); setMessage("We cannot load photos. Try again."); });
  }, [child, list]);

  async function show(photo: Photo) {
    clearImage(); setCurrent(photo);
    if (!["pending", "saved"].includes(photo.state)) return;
    const version = epoch.current;
    const response = await fetch(`/api/account/scans/${photo.id}/image`, { cache: "no-store" });
    if (!response.ok) throw new Error("unavailable");
    const blob = await response.blob();
    if (version !== epoch.current) return;
    const url = URL.createObjectURL(blob);
    imageUrl.current = url; setImage(url);
  }

  async function run(action: () => Promise<void>) {
    const version = epoch.current;
    setBusy(true); setMessage(""); setFailed(false); setRecoverable(false);
    try { await action(); }
    catch (error) {
      if (version === epoch.current) {
        setFailed(true); setMessage(errorText[error instanceof Error ? error.message : ""] ?? "We cannot complete this step. Try again.");
        setRecoverable(Boolean(upload.current) && (!(error instanceof Error) || !errorText[error.message] || error.message === "uncertain"));
      }
    } finally { if (version === epoch.current) setBusy(false); }
  }

  async function send(file: File) {
    const version = epoch.current;
    const photoBody = await prepareScanPhoto(file);
    if (version !== epoch.current) return;
    const attempt = { id: crypto.randomUUID() };
    upload.current = attempt;
    const admission = await api("/api/account/scans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: attempt.id, child, bytes: file.size }) });
    if (version !== epoch.current) return;
    const data = admission.state === "reserved"
      ? await api(`/api/account/scans/${attempt.id}`, { method: "PUT", body: photoBody })
      : await api(`/api/account/scans/${attempt.id}`);
    if (version !== epoch.current) return;
    await show(data.photo); await list(); upload.current = null;
  }

  return <div className="scan-pages">
    <p className="lead">Keep a photo of a finished page with your child&apos;s workbook.</p>
    <label className="scan-child">Child
      <select value={child} disabled={busy} onChange={(event) => {
        epoch.current++; clearImage(); setCurrent(null); setPhotos([]); upload.current = null; setMessage(""); setBusy(false); setChild(event.target.value);
      }}>{childrenList.map((c) => <option key={c.id} value={c.id}>{c.first_name}</option>)}</select>
    </label>
    {!current && <section className="acct-card scan-notice" aria-label="About your page photos">
      <h2>Before you take a photo</h2>
      <p>We keep one private page photo for up to 90 days. We remove photo details such as the location. We do not keep the original camera file.</p>
      <p>The whole page photo will be used for marking by an AI service when checking is available. It can show your child&apos;s first name and printed page code. No marking happens yet.</p>
      <p>You and our admin team can view the photo. You can delete it sooner. We will keep marks and the AI&apos;s reading of written answers until your family account is deleted. <Link href="/privacy">Read about privacy</Link>.</p>
    </section>}
    {!current && <section className="scan-capture">
      <h2>Photograph one finished page</h2>
      <p>Lay the page flat in good light. Keep all four corners and the QR code in view.</p>
      <label className={`btn scan-file${busy ? " scan-disabled" : ""}`}>{busy ? "Uploading photo..." : "Take or choose a photo"}<input aria-label="Take or choose a photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" disabled={busy || !child} onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(() => send(file)); event.target.value = ""; }} /></label>
      <p className="small">One page in each photo. No marks or scores yet.</p>
    </section>}
    {message && <p role={failed ? "alert" : "status"} className={`acct-alert${failed ? "" : " acct-saved"}`}>{message}</p>}
    {failed && recoverable && <button className="btn ghost" disabled={busy} onClick={() => void run(async () => {
      if (!upload.current) { await list(); return; }
      const data = await api(`/api/account/scans/${upload.current!.id}`);
      if (data.photo && ["pending", "saved"].includes(data.photo.state)) { await show(data.photo); await list(); upload.current = null; }
      else throw new Error(data.photo?.state === "processing" ? "uncertain" : "image");
    })}>Check upload</button>}
    {current && <section className="acct-card scan-result">
      <h2>{current.state === "saved" ? "Photo saved" : "Confirm this page"}</h2>
      <p className="scan-identity"><b>{current.child}</b><span>Workbook {current.book} · {current.day ?? "Workbook page"} · Page {current.page}</span></p>
      {image && <Image unoptimized width={1200} height={1600} className="scan-image" src={image} alt={`Finished workbook page for ${current.child}`} />}
      <p className="small">{current.state === "saved" ? "This photo is private. It has not been marked." : "Check the child, workbook, day and page before you save."}</p>
      <div className="scan-actions">
        {current.state === "pending" && <button className="btn" disabled={busy} onClick={() => void run(async () => {
          const version = epoch.current;
          const data = await api(`/api/account/scans/${current.id}`, { method: "POST" });
          if (version !== epoch.current) return;
          setCurrent(data.photo); setMessage("Photo saved. No marking has started."); await list();
        })}>Save this page</button>}
        <button className="btn ghost" disabled={busy} onClick={() => void run(async () => {
          await api(`/api/account/scans/${current.id}`, { method: "DELETE" });
          clearImage(); setCurrent(null); setMessage("Photo deleted. You can take another photo."); await list();
        })}>{current.state === "pending" ? "Discard photo" : "Delete photo"}</button>
        <button className="btn ghost" disabled={busy} onClick={() => { clearImage(); setCurrent(null); setMessage(""); }}>Another page</button>
      </div>
    </section>}
    {photos.length > 0 && <section aria-label="Your page photos"><h2>Your page photos</h2><ul className="scan-list">{photos.map((photo) => <li key={photo.id}><span><b>Workbook {photo.book}</b><br />{photo.day ?? "Workbook page"} · Page {photo.page}</span><button className="btn ghost" disabled={busy} onClick={() => void run(() => show(photo))}>{photo.state === "pending" ? "Confirm page" : "View photo"}</button></li>)}</ul></section>}
  </div>;
}
