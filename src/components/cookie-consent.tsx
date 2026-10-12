"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CONSENT_OPEN_EVENT, getConsent, isConsentPersisted, openConsentSettings, setConsent, subscribeConsent } from "@/lib/consent";
import "./cookie-consent.css";

// Mount once, globally. It shows on a first visit and whenever CookieSettingsButton is pressed.
// The site's mobile CTA hides while this banner is open.
export function CookieConsent({ privacyHref = "/privacy" }: { privacyHref?: string }) {
  // null on the server and during hydration, so a returning visitor never sees a flash of the banner.
  const consent = useSyncExternalStore(subscribeConsent, getConsent, () => null);
  const [reopened, setReopened] = useState(false);
  const root = useRef<HTMLElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onOpen = () => {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setReopened(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    // A change here or in another tab settles the question, so the settings view closes.
    const off = subscribeConsent(() => setReopened(false));
    return () => {
      window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
      off();
    };
  }, []);

  const open = consent === "unset" || (consent !== null && reopened);

  useEffect(() => {
    if (!reopened) return;
    root.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReopened(false);
    };
    document.addEventListener("keydown", onKey);
    const back = returnTo.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      if (back?.isConnected) back.focus();
    };
  }, [reopened]);

  if (!open) return null;

  return (
    <section ref={root} className="ck" data-cookie-banner role="region" aria-labelledby="ck-t" aria-describedby="ck-d" tabIndex={-1}>
      <div className="ck-head">
        <p className="ck-eyebrow">Cookies</p>
        {reopened && (
          <button type="button" className="ck-x" aria-label="Close cookie settings" onClick={() => setReopened(false)}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      <h2 id="ck-t" className="ck-title">Your cookie choice</h2>
      <p id="ck-d" className="ck-text">
        We use optional cookies to understand how people use our website. You can accept or reject them. You can still take the free math assessment either way.
      </p>
      {reopened && consent !== "unset" && (
        <p className="ck-state" role="status">
          {consent === "granted" ? "Optional cookies are on." : "Optional cookies are off."}
          {!isConsentPersisted() && " We could not save your choice. You may need to choose again when you reload the page."}
        </p>
      )}
      <div className="ck-actions">
        <button type="button" className="ck-btn" onClick={() => setConsent("granted")}>Accept optional cookies</button>
        <button type="button" className="ck-btn" onClick={() => setConsent("denied")}>Reject optional cookies</button>
      </div>
      {privacyHref && (
        <p className="ck-fine">
          <a href={privacyHref}>Privacy policy</a>
        </p>
      )}
    </section>
  );
}

// Footer trigger: opens the banner again so the visitor can change the choice.
export function CookieSettingsButton({ className = "ck-link", children = "Cookie settings" }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={openConsentSettings}>
      {children}
    </button>
  );
}
