"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { activityPage } from "@/lib/customer-activity";
import { recordActivity } from "@/lib/customer-activity-client";
/** Fixed page enums only. No URL, search, fragment, token or referrer is transmitted. */
export function CustomerActivityVisits() {
  const path = usePathname();
  useEffect(() => { const page = activityPage(path); if (page) recordActivity("page_visit", page); }, [path]);
  return null;
}
