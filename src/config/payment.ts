export const PAYMENT_METHODS = ["cash", "upi"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ["unpaid", "pending_verification", "paid", "failed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && (PAYMENT_STATUSES as readonly string[]).includes(value);
}

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Unpaid (pay at the turf)",
  pending_verification: "Payment pending verification",
  paid: "Paid",
  failed: "Payment failed",
};

export function getPaymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT_STATUS_LABELS[status];
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash at turf",
  upi: "UPI",
};

export function getPaymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method];
}

export interface UpiConfig {
  payeeVpa: string;
  payeeName: string;
  payeePhone: string | null;
}

export interface TurfPaymentFields {
  upi_vpa: string | null;
  payee_name: string | null;
  upi_phone: string | null;
}

/**
 * UPI acceptance details are per-turf (each turf configures its own VPA/
 * payee name from its admin page), not a global app setting. Returns null
 * (never a guessed/placeholder value) if a turf hasn't configured both the
 * VPA and payee name yet, so the UI can show "UPI isn't available for this
 * turf" instead of a fake payment target.
 */
export function getTurfUpiConfig(turf: TurfPaymentFields): UpiConfig | null {
  if (!turf.upi_vpa || !turf.payee_name) return null;

  return {
    payeeVpa: turf.upi_vpa,
    payeeName: turf.payee_name,
    payeePhone: turf.upi_phone || null,
  };
}
