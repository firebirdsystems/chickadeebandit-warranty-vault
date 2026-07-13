import { describe, it, expect } from "vitest";
import {
  categoryMeta, warrantyExpiryDate, daysUntilDate, warrantyStatus,
  warrantyLabel, sortedItems, parseMoneyToCents,
} from "../src/logic.js";

const FROM = new Date(2026, 6, 12, 9, 0, 0); // July 12, 2026 local

describe("warrantyExpiryDate", () => {
  it("adds months to the purchase date", () => {
    expect(warrantyExpiryDate("2025-11-02", 12)).toBe("2026-11-02");
    expect(warrantyExpiryDate("2026-01-15", 6)).toBe("2026-07-15");
  });
  it("clamps to the target month's length", () => {
    expect(warrantyExpiryDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(warrantyExpiryDate("2023-11-30", 15)).toBe("2025-02-28");
  });
  it("returns empty for unknown coverage", () => {
    expect(warrantyExpiryDate("2026-01-01", null)).toBe("");
    expect(warrantyExpiryDate("", 12)).toBe("");
    expect(warrantyExpiryDate("garbage", 12)).toBe("");
  });
});

describe("warrantyStatus / warrantyLabel", () => {
  it("classifies expired / expiring / active / none", () => {
    expect(warrantyStatus({ warranty_expires_date: "2026-07-01" }, FROM)).toBe("expired");
    expect(warrantyStatus({ warranty_expires_date: "2026-08-01" }, FROM)).toBe("expiring");
    expect(warrantyStatus({ warranty_expires_date: "2027-07-01" }, FROM)).toBe("active");
    expect(warrantyStatus({ warranty_expires_date: "" }, FROM)).toBe("none");
  });
  it("labels sensibly", () => {
    expect(warrantyLabel({ warranty_expires_date: "" }, FROM)).toBe("No warranty");
    expect(warrantyLabel({ warranty_expires_date: "2026-07-12" }, FROM)).toBe("Expires today");
    expect(warrantyLabel({ warranty_expires_date: "2026-07-20" }, FROM)).toBe("8 days left");
    expect(warrantyLabel({ warranty_expires_date: "2026-07-01" }, FROM)).toBe("Expired");
  });
});

describe("sortedItems", () => {
  it("orders expiring → active → none → expired", () => {
    const rows = [
      { id: "none", name: "A", warranty_expires_date: "" },
      { id: "expired", name: "B", warranty_expires_date: "2026-01-01" },
      { id: "active", name: "C", warranty_expires_date: "2027-06-01" },
      { id: "expiring", name: "D", warranty_expires_date: "2026-08-01" },
    ];
    expect(sortedItems(rows, FROM).map((r) => r.id)).toEqual(["expiring", "active", "none", "expired"]);
  });
});

describe("daysUntilDate", () => {
  it("handles today/future/past/blank", () => {
    expect(daysUntilDate("2026-07-12", FROM)).toBe(0);
    expect(daysUntilDate("2026-07-15", FROM)).toBe(3);
    expect(daysUntilDate("2026-07-10", FROM)).toBe(-2);
    expect(daysUntilDate("", FROM)).toBeNull();
  });
});

describe("parseMoneyToCents", () => {
  it("parses dollars to integer cents", () => {
    expect(parseMoneyToCents("749.99")).toBe(74999);
    expect(parseMoneyToCents("$1,199")).toBe(119900);
    expect(parseMoneyToCents("")).toBeNull();
  });
});

describe("categoryMeta", () => {
  it("falls back to other", () => expect(categoryMeta("bogus").value).toBe("other"));
});
