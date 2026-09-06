import { describe, expect, test } from "bun:test";
import { parseCapacity, parseSections, toListing } from "../src/listings.ts";
import { gai, GAI } from "./helpers.ts";

describe("listing transform", () => {
  test("reads the GAI filler the way a buyer does", () => {
    const listing = toListing({ ...gai, available: true });
    expect(listing.sku).toBe(GAI);
    expect(listing.manufacturer).toBe("GAI");
    expect(listing.capacity).toEqual({ value: 1300, unit: "bottles/h" });
    expect(listing.containers).toEqual(["glass"]);
    expect(listing.closures).toEqual(["crown cork"]);
    expect(listing.beverages).toContain("beer");
    expect(listing.formats).toBe("0.33 L / 0.5 L / 0.75 L glass");
    expect(listing.specs["Filling valves"]).toBe("6");
    expect(listing.availability).toBe("from 27 Nov 2026");
    expect(listing.availableOn).toBe("2026-11-27");
    expect(listing.url).toBe(`https://www.bevmaq.com/buy/gai-mle-661_${GAI}/`);
    expect(listing.images.length).toBe(13);
    expect(listing.sections.map((section) => section.heading)).toEqual(["Overview", "Technical data", "Equipment", "Condition", "Availability"]);
  });

  test("sections come from strong paragraphs and h2 headings alike", () => {
    const sections = parseSections("<h2>Overview</h2><p>A</p><p><strong>Technical data&nbsp;</strong></p><ul><li>Capacity: 5 hl</li></ul>");
    expect(sections.map((section) => [section.heading, section.lines])).toEqual([
      ["Overview", ["A"]],
      ["Technical data", ["Capacity: 5 hl"]],
    ]);
  });

  test("capacity parsing handles units, thousands and typos", () => {
    expect(parseCapacity("up to 1,300 bph")).toEqual({ value: 1300, unit: "bottles/h" });
    expect(parseCapacity("Output: 12.400 bottles/hour")).toEqual({ value: 12400, unit: "bottles/h" });
    expect(parseCapacity("30 kegs/h")).toEqual({ value: 30, unit: "kegs/h" });
    expect(parseCapacity("200 bottles/min")).toEqual({ value: 12000, unit: "bottles/h" });
    expect(parseCapacity("12.5000 bottles/hour")).toBeNull();
    expect(parseCapacity("no rating here")).toBeNull();
  });
});
