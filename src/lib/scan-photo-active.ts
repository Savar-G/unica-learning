/** The pending-photo limit matches public.scan_photo_is_active. */
export const SCAN_PENDING_WINDOW_MS = 23.5 * 3_600_000;

export const scanPhotoIsActive = (photo: { state: string; created_at: string; expires_at: string }, now: number) =>
  Date.parse(photo.expires_at) > now && (photo.state === "saved" || (photo.state === "pending" && Date.parse(photo.created_at) > now - SCAN_PENDING_WINDOW_MS));
