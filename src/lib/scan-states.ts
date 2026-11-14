// The stored states of the scan pages (docs/state-machines.md, item 7), one list each. The database's check constraints
// hold the same lists; src/lib/state-lists.test.ts proves each list equals its check, and src/lib/database.ts gives the
// columns these types, so a wrong value in a read or a write fails the build. Pure: no imports, no side effects.

/**
 * A scan photo (public.scan_photos.state, migration 20261102_scan_page_photos): reserved (admitted, no file yet) ->
 * processing (the upload is being checked) -> pending (on the device's stack) -> saved (kept; a photo saves itself when it
 * arrives, D-269), and the
 * ends deleted, expired and rejected. A pending photo stays active for SCAN_PENDING_WINDOW_MS (src/lib/scan-photo-active.ts).
 */
export const SCAN_PHOTO_STATES = ["reserved", "processing", "pending", "saved", "deleted", "expired", "rejected"] as const;
export type ScanPhotoState = (typeof SCAN_PHOTO_STATES)[number];

/**
 * A photo's marking job (public.scan_marking_jobs.state, migration 20261105_scan_marking): queued -> running (a lease
 * is held, no model answer yet) -> extracted (the model answered) -> finished. A pause sends it back to queued with a
 * blocked reason (a claim then goes straight to extracted when the model already answered); a pause for `attempts`
 * finishes it, and its unread items go to the team (#779).
 */
export const SCAN_JOB_STATES = ["queued", "running", "extracted", "finished"] as const;
export type ScanJobState = (typeof SCAN_JOB_STATES)[number];

/**
 * Why a marking job was paused (public.scan_marking_jobs.blocked_reason; null when a claim cleared it). `attempts` is
 * the one reason that finishes the job, and a finish keeps the last reason.
 */
export const SCAN_BLOCKED_REASONS = ["off", "budget", "price-unverified", "attempts", "pending"] as const;
export type ScanBlockedReason = (typeof SCAN_BLOCKED_REASONS)[number];

/**
 * Why a marking dispatch stopped counting against the job's two dispatches (public.scan_marking_dispatches.clean_failure,
 * migration 20261114011948_scan_marking_clean_failures, #868; null for every other dispatch). Only a 429 whose body the
 * database accepted as OpenRouter's clean error envelope: its hold is freed (charge 0). A time-out or 5xx is never one.
 */
export const SCAN_CLEAN_FAILURES = ["rate-limit"] as const;
export type ScanCleanFailure = (typeof SCAN_CLEAN_FAILURES)[number];

/** A page calibration (public.scan_calibrations.state, #455). */
export const SCAN_CALIBRATION_STATES = ["running", "ready", "refused"] as const;
export type ScanCalibrationState = (typeof SCAN_CALIBRATION_STATES)[number];
