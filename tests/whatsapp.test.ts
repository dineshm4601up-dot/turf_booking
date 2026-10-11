import { describe, expect, it } from "vitest";
import { buildBookingWhatsAppMessage, buildWhatsappClickToChatUrl, normalizeWhatsappNumber } from "../src/lib/whatsapp";

describe("normalizeWhatsappNumber", () => {
  it("prepends the 91 country code to a bare 10-digit number", () => {
    expect(normalizeWhatsappNumber("9344689836")).toBe("919344689836");
  });
  it("leaves a number that already carries a country code alone", () => {
    expect(normalizeWhatsappNumber("919344689836")).toBe("919344689836");
  });
  it("strips formatting before normalizing", () => {
    expect(normalizeWhatsappNumber("+91 93446-89836")).toBe("919344689836");
  });
});

describe("buildWhatsappClickToChatUrl", () => {
  it("builds a wa.me link with the normalized number and encoded message", () => {
    const url = buildWhatsappClickToChatUrl("9344689836", "Hello there");
    expect(url).toBe("https://wa.me/919344689836?text=Hello%20there");
  });
  it("encodes newlines and special characters correctly", () => {
    const url = buildWhatsappClickToChatUrl("9344689836", "Line one\nLine two: ₹800");
    expect(url).toContain("text=Line%20one%0ALine%20two");
  });
});

describe("buildBookingWhatsAppMessage", () => {
  it("matches the exact required template", () => {
    const message = buildBookingWhatsAppMessage({
      shortReference: "48217",
      turfName: "GreenTurf Arena",
      customerName: "Priya Sharma",
      customerPhone: "9876543210",
      bookingDateLabel: "Tuesday, October 20, 2026",
      startTimeLabel: "5:00 PM",
      endTimeLabel: "7:30 PM",
      durationLabel: "2.5 hr",
      totalAmount: 2000,
      currencySymbol: "₹",
      paymentMethodLabel: "Cash at turf",
      paymentStatusLabel: "Unpaid (pay at the turf)",
      bookingStatusLabel: "Awaiting approval",
    });

    expect(message).toBe(
      [
        "New Turf Booking Request",
        "",
        "Booking Reference: 48217",
        "Turf Name: GreenTurf Arena",
        "Customer Name: Priya Sharma",
        "Customer Mobile: 9876543210",
        "Booking Date: Tuesday, October 20, 2026",
        "Start Time: 5:00 PM",
        "End Time: 7:30 PM",
        "Duration: 2.5 hr",
        "Total Amount: ₹2000",
        "Payment Method: Cash at turf",
        "Payment Status: Unpaid (pay at the turf)",
        "Booking Status: Awaiting approval",
        "",
        "Please review and confirm this booking.",
      ].join("\n")
    );
  });
});
