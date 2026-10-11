export interface UpiPaymentDetails {
  payeeVpa: string;
  payeeName: string;
  payeePhone?: string | null;
  amount: number;
  transactionNote: string;
}

function encodeUpiParam(value: string): string {
  // encodeURIComponent (not URLSearchParams) so spaces become %20, not "+" --
  // some UPI apps parse upi:// links with a strict URI decoder that doesn't
  // apply the application/x-www-form-urlencoded "+ means space" convention.
  return encodeURIComponent(value);
}

/**
 * Builds a standard UPI deep link: upi://pay?pa=<vpa>&pn=<name>&am=<amount>&cu=INR&tn=<note>.
 * `payeePhone` isn't part of the UPI URI spec (payment routes via the VPA,
 * not a phone number) -- it's informational only, shown next to the QR
 * code for customers who want to pay by phone-number-linked UPI instead.
 */
export function buildUpiPaymentUri(details: UpiPaymentDetails): string {
  const parts = [
    `pa=${encodeUpiParam(details.payeeVpa)}`,
    `pn=${encodeUpiParam(details.payeeName)}`,
    `am=${encodeUpiParam(details.amount.toFixed(2))}`,
    `cu=INR`,
    `tn=${encodeUpiParam(details.transactionNote)}`,
  ];
  return `upi://pay?${parts.join("&")}`;
}
