import "server-only";
import { createHash } from "node:crypto";
export const sourceHash = (v: unknown): string => createHash("sha256").update(canonical(v)).digest("hex");
export function canonical(v: unknown): string {
  if (v === null || typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" && Number.isFinite(v)) return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) return `{${Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
  throw Error("invalid-json");
}
