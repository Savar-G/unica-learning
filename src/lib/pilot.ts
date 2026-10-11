import { connection } from "next/server";
import { notFound } from "next/navigation";

// The online assessment stays behind this setting until the launch ticket (#82). Pilot families get a direct link to /start.
// Off: /start, /sign-in/*, /auth/*, /account/* and /api/account/* answer 404, and the public site keeps the old signup.
export const pilotOn = () => process.env.ASSESSMENT_PILOT === "on";

/** For pilot pages: read the setting per request, not once at build time, then 404 when it is off. */
export async function requirePilot() {
  await connection();
  if (!pilotOn()) notFound();
}
