import { describe, expect, it } from "vitest";
import { buildUpiPaymentUri } from "../src/lib/upi";

describe("buildUpiPaymentUri", () => {
  it("builds a correctly-structured upi:// deep link", () => {
    const uri = buildUpiPaymentUri({
      payeeVpa: "turf@upi",
      payeeName: "GreenTurf Arena",
      amount: 800,
      transactionNote: "ref-123",
    });
    expect(uri.startsWith("upi://pay?")).toBe(true);
    expect(uri).toContain("pa=turf%40upi");
    expect(uri).toContain("cu=INR");
  });

  it("formats the amount with exactly two decimal places", () => {
    const uri = buildUpiPaymentUri({
      payeeVpa: "turf@upi",
      payeeName: "Turf",
      amount: 800,
      transactionNote: "ref",
    });
    expect(uri).toContain("am=800.00");
  });

  it("preserves a fractional amount correctly", () => {
    const uri = buildUpiPaymentUri({
      payeeVpa: "turf@upi",
      payeeName: "Turf",
      amount: 1233.5,
      transactionNote: "ref",
    });
    expect(uri).toContain("am=1233.50");
  });

  it("percent-encodes spaces as %20, not +", () => {
    const uri = buildUpiPaymentUri({
      payeeVpa: "turf@upi",
      payeeName: "Green Turf Arena",
      amount: 800,
      transactionNote: "booking ref",
    });
    expect(uri).toContain("pn=Green%20Turf%20Arena");
    expect(uri).toContain("tn=booking%20ref");
    expect(uri).not.toContain("+");
  });

  it("includes the booking reference as the transaction note", () => {
    const uri = buildUpiPaymentUri({
      payeeVpa: "turf@upi",
      payeeName: "Turf",
      amount: 800,
      transactionNote: "11111111-1111-4111-8111-111111111111",
    });
    expect(uri).toContain("tn=11111111-1111-4111-8111-111111111111");
  });

  it("every parameter value is present exactly once", () => {
    const uri = buildUpiPaymentUri({
      payeeVpa: "turf@upi",
      payeeName: "Turf",
      amount: 500,
      transactionNote: "ref",
    });
    const params = new URLSearchParams(uri.split("?")[1]);
    expect(params.get("pa")).toBe("turf@upi");
    expect(params.get("pn")).toBe("Turf");
    expect(params.get("am")).toBe("500.00");
    expect(params.get("cu")).toBe("INR");
    expect(params.get("tn")).toBe("ref");
  });
});
