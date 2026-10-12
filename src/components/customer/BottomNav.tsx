"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/my-bookings", label: "Bookings", icon: CalendarDays },
] as const;

/**
 * Fixed bottom nav shared by every customer-facing page (see
 * src/app/(customer)/layout.tsx -- admin routes have their own layout and
 * never render this). Only Home and Bookings -- the Profile tab was
 * removed from the nav (the /profile route itself still exists, just
 * unlinked from here; nothing was deleted). Each item uses `flex-1`, so
 * two items split the row evenly instead of leaving a gap where Profile
 * used to be. Both routes are exact-match (neither nests further).
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-2xl items-stretch justify-around">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex min-h-14 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 py-1.5"
            >
              <Icon
                className={`size-5 ${active ? "text-turf-700" : "text-slate-400"}`}
                aria-hidden="true"
                strokeWidth={active ? 2.5 : 2}
              />
              <span className={`text-[11px] font-medium ${active ? "text-turf-700" : "text-slate-500"}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Height of BottomNav's content box (excluding the safe-area inset), for pages that need to offset a sticky element directly above it. */
export const BOTTOM_NAV_HEIGHT_PX = 56;
