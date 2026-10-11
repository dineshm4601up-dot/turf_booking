"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ban, CalendarCheck, LayoutDashboard, LogOut, Menu, MapPinned, Tag, X } from "lucide-react";
import { signOutAction } from "@/app/admin/actions";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/turfs", label: "Turfs", icon: MapPinned },
  { href: "/admin/pricing", label: "Pricing", icon: Tag },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/admin/blocks", label: "Blocked Slots", icon: Ban },
];

export function AdminSidebar({ email }: { email: string | null }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div className="md:hidden flex items-center justify-between bg-white border-b border-slate-200 px-4 py-3">
        <span className="font-bold text-slate-800">Admin</span>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="min-h-11 min-w-11 flex items-center justify-center rounded-lg border border-slate-200"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        </button>
      </div>

      <nav
        className={`${mobileOpen ? "flex" : "hidden"} md:flex flex-col w-full md:w-56 shrink-0 bg-white border-b md:border-b-0 md:border-r border-slate-200 px-3 py-4 gap-1`}
        aria-label="Admin navigation"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={isActive ? "page" : undefined}
              className={`flex items-center gap-2 min-h-11 rounded-lg px-3 text-sm font-medium transition-colors ${
                isActive ? "bg-turf-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}

        <div className="mt-4 pt-4 border-t border-slate-200 md:mt-auto">
          {email && <p className="text-xs text-slate-400 px-3 mb-2 truncate">{email}</p>}
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full flex items-center gap-2 min-h-11 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </nav>
    </>
  );
}
