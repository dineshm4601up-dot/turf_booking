import { describe, expect, it } from "vitest";
import { slugify } from "../src/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Erode Sports Arena")).toBe("erode-sports-arena");
  });

  it("preserves numbers", () => {
    expect(slugify("The 4th Zone Turf")).toBe("the-4th-zone-turf");
  });

  it("strips punctuation and special characters", () => {
    expect(slugify("Amman's Sports Arena!!")).toBe("amman-s-sports-arena");
    expect(slugify("Turf @ Erode (Main Branch)")).toBe("turf-erode-main-branch");
  });

  it("collapses repeated hyphens/whitespace into a single hyphen", () => {
    expect(slugify("Turf   --  Name")).toBe("turf-name");
    expect(slugify("Multiple     Spaces")).toBe("multiple-spaces");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("--Turf Name--")).toBe("turf-name");
    expect(slugify("  Turf Name  ")).toBe("turf-name");
  });

  it("falls back to a fixed base for a name with nothing slug-able", () => {
    expect(slugify("!!!")).toBe("turf");
    expect(slugify("")).toBe("turf");
    expect(slugify("   ")).toBe("turf");
  });

  it("leaves an already-clean slug-like name unchanged", () => {
    expect(slugify("green-turf-arena")).toBe("green-turf-arena");
  });

  it("produces the same slug for two turfs with identical names (dedup is the caller's job)", () => {
    expect(slugify("Green Turf")).toBe(slugify("Green Turf"));
  });
});
