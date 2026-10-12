import QRCode from "react-qr-code";
import { ExternalLink, Smartphone } from "lucide-react";
import { CURRENCY_SYMBOL } from "@/config/turf";

export interface UpiPanelData {
  payeeVpa: string;
  payeeName: string;
  payeePhone: string | null;
  amount: number;
  note: string;
  uri: string;
}

export function UpiPaymentPanel({ upi }: { upi: UpiPanelData }) {
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
        <Smartphone className="size-4" aria-hidden="true" />
        Pay with UPI
      </h3>

      <dl className="grid grid-cols-2 gap-y-1 text-sm mt-2">
        <dt className="text-amber-800">UPI ID</dt>
        <dd className="text-right font-mono text-amber-900 break-all">{upi.payeeVpa}</dd>
        <dt className="text-amber-800">Payee name</dt>
        <dd className="text-right font-medium text-amber-900">{upi.payeeName}</dd>
        {upi.payeePhone && (
          <>
            <dt className="text-amber-800">Phone</dt>
            <dd className="text-right font-medium text-amber-900">{upi.payeePhone}</dd>
          </>
        )}
        <dt className="text-amber-800 font-semibold pt-1 border-t border-amber-200 mt-1">Amount</dt>
        <dd className="text-right font-bold text-amber-900 pt-1 border-t border-amber-200 mt-1">
          {CURRENCY_SYMBOL}
          {upi.amount}
        </dd>
      </dl>

      <div className="flex flex-col items-center gap-3 mt-4">
        <div className="w-full max-w-[200px] rounded-lg border border-amber-200 bg-white p-3">
          <QRCode value={upi.uri} size={256} style={{ width: "100%", height: "auto" }} />
        </div>
        <p className="text-xs text-amber-800 text-center">
          Scan with any UPI app on another device, or tap the button below on this phone.
        </p>
        <a
          href={upi.uri}
          className="flex w-full min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-600 text-sm font-semibold text-white hover:bg-amber-700"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          Pay with UPI
        </a>
      </div>

      <p className="mt-3 text-xs text-amber-800">
        Payment note: <span className="font-mono break-all">{upi.note}</span>. Opening a UPI app or returning to
        this page does not confirm payment by itself &mdash; the turf will verify your payment and mark it Paid.
      </p>
    </div>
  );
}
