import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { adminClient } from "@/lib/supabase-admin";
import { openRenderer, projectAssets } from "@/lib/workbook-v2/render/typst";
import { vercelAssets } from "@/lib/workbook-v2/render/vercel";
import type { JobDeps } from "./job";
import { v2Files, v2PublishStore } from "./supabase-store";

// The seams of the v2 book job on the server: Supabase with the secret key, the pinned Typst (the staged linux program in
// a Vercel function, the installed one on a laptop), the clock, and random ids and QR tokens.

/** The job's seams, or null when the secret key is not set. */
export function serverDeps(): JobDeps | null {
  const db = adminClient();
  if (!db) return null;
  return {
    store: v2PublishStore(db),
    files: v2Files(db),
    renderer: () => openRenderer(process.env.VERCEL ? vercelAssets(process.cwd()) : projectAssets(process.cwd(), homedir(), process.platform, process.arch)),
    now: () => new Date(),
    clock: () => performance.now(),
    uuid: randomUUID,
    token: () => randomBytes(18).toString("base64url"),
  };
}
