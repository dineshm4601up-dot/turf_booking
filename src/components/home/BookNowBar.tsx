"use client";

import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { BOTTOM_NAV_HEIGHT_PX } from "@/components/customer/BottomNav";

interface BookNowBarProps {
  href: string;
}

/**
 * Navigates to the existing Book Slot page (/book/[slug]) for the active
 * turf -- the turf id is baked into `href` by the caller, so the correct
 * turf is never lost between Home and the booking page.
 *
 * Mobile: a fixed bar stacked directly above BottomNav (offset by its exact
 * height plus its safe-area inset, so it never overlaps on a notched
 * device). Desktop (sm+): the fixed mobile bar is hidden in favor of an
 * inline button rendered inline in the page instead -- a full-width fixed
 * bar doesn't make sense once the content column stops being the whole
 * viewport width.
 */
export function BookNowBar({ href }: BookNowBarProps) {
  return (
    <div
      className="fixed inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur sm:hidden"
      style={{ bottom: `calc(${BOTTOM_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom))` }}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2.5">
        <span className="text-sm text-slate-600">Choose your slot</span>
        <Link
          href={href}
          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-turf-600 px-4 text-sm font-semibold text-white hover:bg-turf-700"
        >
          <CalendarPlus className="size-4" aria-hidden="true" />
          Book Now
        </Link>
      </div>
    </div>
  );
}

export function BookNowInline({ href }: BookNowBarProps) {
  return (
    <Link
      href={href}
      className="hidden sm:flex min-h-11 items-center gap-1.5 rounded-lg bg-turf-600 px-5 text-sm font-semibold text-white hover:bg-turf-700 self-start"
    >
      <CalendarPlus className="size-4" aria-hidden="true" />
      Book Now
    </Link>
  );
}
