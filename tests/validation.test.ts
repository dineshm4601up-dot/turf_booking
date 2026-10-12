import { describe, expect, it } from "vitest";
import {
  isPhoneLike,
  isValidDateString,
  isValidTimeString,
  isValidUuid,
  normalizeIndianMobileNumber,
  restrictToDigits,
  validateCustomerName,
  validateCustomerPhone,
} from "../src/lib/validation";

describe("restrictToDigits", () => {
  it("strips non-digit characters", () => {
    expect(restrictToDigits("98a76!5@43#", 10)).toBe("9876543");
  });
  it("truncates to the given maximum length -- an 11th digit never survives", () => {
    expect(restrictToDigits("987654321099", 10)).toBe("9876543210");
    expect(restrictToDigits("987654321099", 10)).toHaveLength(10);
  });
  it("handles an empty string", () => {
    expect(restrictToDigits("", 10)).toBe("");
  });
});

describe("isPhoneLike", () => {
  it("accepts typical admin-entered phone formats", () => {
    expect(isPhoneLike("9344689836")).toBe(true);
    expect(isPhoneLike("+91 93446 89836")).toBe(true);
    expect(isPhoneLike("(044) 1234-5678")).toBe(true);
  });
  it("rejects letters and too-short input", () => {
    expect(isPhoneLike("not a phone")).toBe(false);
    expect(isPhoneLike("12345")).toBe(false);
  });
});

describe("isValidDateString", () => {
  it("accepts a real calendar date", () => {
    expect(isValidDateString("2026-10-11")).toBe(true);
  });
  it("rejects a non-existent calendar date", () => {
    expect(isValidDateString("2026-02-30")).toBe(false);
  });
  it("rejects malformed input", () => {
    expect(isValidDateString("10/11/2026")).toBe(false);
    expect(isValidDateString("not-a-date")).toBe(false);
  });
});

describe("isValidTimeString", () => {
  it("accepts HH:mm", () => {
    expect(isValidTimeString("17:00")).toBe(true);
    expect(isValidTimeString("00:00")).toBe(true);
    expect(isValidTimeString("23:59")).toBe(true);
  });
  it("rejects out-of-range or malformed times", () => {
    expect(isValidTimeString("24:00")).toBe(false);
    expect(isValidTimeString("17:60")).toBe(false);
    expect(isValidTimeString("5pm")).toBe(false);
  });
});

describe("isValidUuid", () => {
  it("accepts a well-formed uuid", () => {
    expect(isValidUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
  });
  it("rejects malformed input", () => {
    expect(isValidUuid("not-a-uuid")).toBe(false);
    expect(isValidUuid("")).toBe(false);
  });
});

describe("validateCustomerName", () => {
  it("accepts a normal name", () => {
    const result = validateCustomerName("Priya Sharma");
    expect(result).toEqual({ ok: true, value: "Priya Sharma" });
  });
  it("rejects a too-short name", () => {
    expect(validateCustomerName("A").ok).toBe(false);
  });
  it("rejects a name with digits or symbols", () => {
    expect(validateCustomerName("Robert'); DROP TABLE bookings;--").ok).toBe(false);
    expect(validateCustomerName("Agent47").ok).toBe(false);
  });
  it("rejects a non-string value", () => {
    expect(validateCustomerName(12345).ok).toBe(false);
  });
});

describe("normalizeIndianMobileNumber", () => {
  it("accepts a plain 10-digit number starting with 6-9", () => {
    expect(normalizeIndianMobileNumber("9876543210")).toBe("9876543210");
    expect(normalizeIndianMobileNumber("6000000000")).toBe("6000000000");
  });
  it("strips a +91 country code", () => {
    expect(normalizeIndianMobileNumber("+919876543210")).toBe("9876543210");
  });
  it("strips a bare 91 country code", () => {
    expect(normalizeIndianMobileNumber("919876543210")).toBe("9876543210");
  });
  it("strips a leading trunk 0", () => {
    expect(normalizeIndianMobileNumber("09876543210")).toBe("9876543210");
  });
  it("strips spaces and hyphens used as formatting", () => {
    expect(normalizeIndianMobileNumber("98765 43210")).toBe("9876543210");
    expect(normalizeIndianMobileNumber("98765-43210")).toBe("9876543210");
    expect(normalizeIndianMobileNumber("+91 98765-43210")).toBe("9876543210");
  });
  it("does not misfire a prefix strip on a number that genuinely starts with 91", () => {
    // "9123456789" is a valid 10-digit number in its own right (starts with 9);
    // it must NOT be mistaken for "91" + an 8-digit remainder.
    expect(normalizeIndianMobileNumber("9123456789")).toBe("9123456789");
  });
  it("rejects a number with the wrong number of digits", () => {
    expect(normalizeIndianMobileNumber("12345")).toBeNull();
    expect(normalizeIndianMobileNumber("123456789012")).toBeNull();
  });
  it("rejects a number starting with 0-5 (not a valid Indian mobile range)", () => {
    expect(normalizeIndianMobileNumber("5876543210")).toBeNull();
    expect(normalizeIndianMobileNumber("1234567890")).toBeNull();
  });
  it("rejects input containing letters, even if digit-count would otherwise match", () => {
    expect(normalizeIndianMobileNumber("98765432ab")).toBeNull();
    expect(normalizeIndianMobileNumber("987654321O")).toBeNull(); // letter O, not zero
  });
});

describe("validateCustomerPhone", () => {
  it("accepts and normalizes a 10-digit number with formatting", () => {
    const result = validateCustomerPhone("98765-43210");
    expect(result).toEqual({ ok: true, value: "9876543210" });
  });
  it("accepts and normalizes a number with a +91 country code", () => {
    const result = validateCustomerPhone("+91 9876543210");
    expect(result).toEqual({ ok: true, value: "9876543210" });
  });
  it("rejects a number with the wrong number of digits", () => {
    expect(validateCustomerPhone("12345").ok).toBe(false);
    expect(validateCustomerPhone("123456789012").ok).toBe(false);
  });
  it("rejects letters", () => {
    expect(validateCustomerPhone("98765432ab").ok).toBe(false);
  });
  it("rejects a non-string value", () => {
    expect(validateCustomerPhone(9876543210).ok).toBe(false);
  });
});
