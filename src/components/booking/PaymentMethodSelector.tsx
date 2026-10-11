"use client";

import { Banknote, Smartphone } from "lucide-react";
import type { PaymentMethod } from "@/config/payment";

interface PaymentMethodSelectorProps {
  value: PaymentMethod | null;
  onChange: (method: PaymentMethod) => void;
  upiAvailable: boolean;
}

export function PaymentMethodSelector({ value, onChange, upiAvailable }: PaymentMethodSelectorProps) {
  return (
    <div>
      <p className="block text-xs font-medium text-slate-600 mb-1.5">Payment method</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment method">
        <button
          type="button"
          role="radio"
          aria-checked={value === "cash"}
          onClick={() => onChange("cash")}
          className={`flex items-center justify-center gap-2 min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors ${
            value === "cash"
              ? "border-turf-600 bg-turf-600 text-white"
              : "border-slate-300 text-slate-700 hover:border-turf-400"
          }`}
        >
          <Banknote className="size-4" aria-hidden="true" />
          Cash at turf
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={value === "upi"}
          disabled={!upiAvailable}
          onClick={() => onChange("upi")}
          title={upiAvailable ? undefined : "UPI isn't configured for this turf yet"}
          className={`flex items-center justify-center gap-2 min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            value === "upi"
              ? "border-turf-600 bg-turf-600 text-white"
              : "border-slate-300 text-slate-700 hover:border-turf-400"
          }`}
        >
          <Smartphone className="size-4" aria-hidden="true" />
          UPI
        </button>
      </div>
      {!upiAvailable && (
        <p className="mt-1.5 text-xs text-slate-500">UPI payment isn&apos;t configured yet &mdash; pay cash at the turf.</p>
      )}
    </div>
  );
}
