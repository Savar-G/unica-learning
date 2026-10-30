import "server-only";
import type { NextResponse } from "next/server";
import { DESK_COOKIE, lockCookie } from "@/lib/desk";

// Server parts of the child's desk (#301, src/lib/desk.ts): the desk cookie, and the origin check of its form POST.

/** Puts this device in desk mode for the child, for 30 days or until the parent's PIN ends it. */
export function openDesk(response: NextResponse, parentId: string, childId: string) {
  response.cookies.set(DESK_COOKIE, lockCookie(parentId, childId), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 24 * 60 * 60,
  });
}

export function closeDesk(response: NextResponse) {
  response.cookies.delete({ name: DESK_COOKIE, path: "/" });
}

/** A form POST from this site only: a page on another site cannot open the desk on the parent's device. */
export const sameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(request.url).origin;
};
