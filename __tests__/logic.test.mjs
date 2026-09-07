import { describe, it, expect } from "vitest";
import {
  categoryMeta, warrantyExpiryDate, daysUntilDate, warrantyStatus,
  warrantyLabel, sortedItems, parseMoneyToCents, searchableFields,
  itemSourceRefId, wantsExpiryEntry, expiryRetractionReason, expiryInputsChanged,
  expiryReviewTitle, expirySummary, saveEventPlan, itemAddedPayload,
  expiryScheduledPayload, expiryCancelledPayload,
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

describe("searchableFields", () => {
  it("finds an item by serial number, which is where a claim actually starts", () => {
    const item = {
      name: "Dishwasher", retailer: "Curry's", category: "appliance",
      serial_number: "SN-99213-A", notes: "extended cover to 2029",
    };
    const fields = searchableFields(item);
    expect(fields).toContain("SN-99213-A");
    expect(fields).toContain("extended cover to 2029");
    expect(fields).toContain("Curry's");
  });
});

describe("calendar automation helpers", () => {
  const covered = {
    id: "i1", name: "LG Dishwasher", category: "appliances", retailer: "Home Depot",
    purchase_date: "2025-11-02", warranty_expires_date: "2026-11-02",
    serial_number: "LG-8842-A", notes: "extended cover quoted at 89",
  };
  const uncovered = { ...covered, warranty_expires_date: "" };

  it("namespaces the source ref by app, so it cannot collide with another publisher's", () => {
    expect(itemSourceRefId(covered)).toBe("warranty-vault:i1");
  });

  it("wants an entry only for a real yyyy-mm-dd expiry", () => {
    // A blank expiry is a MISSING required param to the runner, not an absent
    // optional, so publishing one fails the whole run.
    expect(wantsExpiryEntry(covered)).toBe(true);
    expect(wantsExpiryEntry(uncovered)).toBe(false);
    expect(wantsExpiryEntry({ warranty_expires_date: null })).toBe(false);
    expect(wantsExpiryEntry({})).toBe(false);
  });

  it("retracts only on the transition out of wanting an entry", () => {
    expect(expiryRetractionReason(covered, uncovered)).toBe("cover_removed");
    // Still wants one: moving the date is an upsert, not a retraction.
    expect(expiryRetractionReason(covered, { ...covered, warranty_expires_date: "2027-01-05" })).toBeNull();
    // Never wanted one, so there is nothing on the calendar to take down.
    expect(expiryRetractionReason(uncovered, uncovered)).toBeNull();
    expect(expiryRetractionReason(null, covered)).toBeNull();
  });

  it("re-announces for a moved date or a renamed item, and not for a note-only edit", () => {
    expect(expiryInputsChanged(covered, { ...covered, warranty_expires_date: "2027-01-05" })).toBe(true);
    expect(expiryInputsChanged(covered, { ...covered, name: "LG Dishwasher (kitchen)" })).toBe(true);
    expect(expiryInputsChanged(covered, uncovered)).toBe(true);
    expect(expiryInputsChanged(covered, { ...covered, notes: "receipt in the drawer" })).toBe(false);
    expect(expiryInputsChanged(covered, { ...covered, serial_number: "LG-8842-B" })).toBe(false);
    // A brand new row has no previous state to compare, so it always announces.
    expect(expiryInputsChanged(null, covered)).toBe(true);
  });

  it("titles the entry as an action, not as a bare product name", () => {
    expect(expiryReviewTitle(covered)).toBe("LG Dishwasher warranty expires");
  });

  it("summarises with scope-visible fields only, never the serial or the notes", () => {
    const summary = expirySummary(covered);
    expect(summary).toContain("Appliances");
    expect(summary).toContain("Home Depot");
    // The summary reaches an external calendar through the household ICS feed,
    // and a serial number is the credential a claim is made with.
    expect(summary).not.toContain("LG-8842-A");
    expect(summary).not.toContain("extended cover quoted at 89");
  });

  it("drops the retailer when there is none, rather than leaving a dangling separator", () => {
    expect(expirySummary({ ...covered, retailer: "", purchase_date: "" })).toBe("Appliances");
  });
});

describe("saveEventPlan", () => {
  const covered = {
    id: "i1", name: "LG Dishwasher", category: "appliances", retailer: "Home Depot",
    purchase_date: "2025-11-02", warranty_expires_date: "2026-11-02",
    serial_number: "LG-8842-A", notes: "receipt in the drawer", created_by: "m1",
  };
  const uncovered = { ...covered, warranty_expires_date: "" };
  const types = (plan) => plan.map((e) => e.type);

  it("announces an item with no warranty as an item, and puts nothing on the calendar", () => {
    // The regression this pins: `warranty.item_added` is the app's standing
    // "an item was added" contract, and it fired on every insert long before
    // there was a calendar lane. Guarding IT on the expiry date would silently
    // drop no-warranty items out of every rule already keyed on it. The guard
    // belongs on the calendar event, which is the one whose event_date would
    // otherwise be an empty string — a MISSING required param to the runner,
    // not an absent optional, which fails the whole run.
    const plan = saveEventPlan(null, uncovered);
    expect(types(plan)).toEqual(["warranty.item_added"]);
    expect(types(plan)).not.toContain("warranty.expiry_scheduled");
    expect(plan[0].payload.warranty_expires_date).toBe("");
  });

  it("announces both lanes for an insert that has cover", () => {
    expect(types(saveEventPlan(null, covered)))
      .toEqual(["warranty.item_added", "warranty.expiry_scheduled"]);
  });

  it("never re-publishes item_added on an edit — the item was added once", () => {
    const plan = saveEventPlan(covered, { ...covered, warranty_expires_date: "2027-01-05" });
    expect(types(plan)).toEqual(["warranty.expiry_scheduled"]);
    expect(plan[0].payload.warranty_expires_date).toBe("2027-01-05");
  });

  it("retracts when an edit clears the expiry", () => {
    const plan = saveEventPlan(covered, uncovered);
    expect(types(plan)).toEqual(["warranty.expiry_cancelled"]);
    expect(plan[0].payload.reason).toBe("cover_removed");
  });

  it("publishes nothing for a note-only edit", () => {
    expect(saveEventPlan(covered, { ...covered, notes: "extended cover quoted" })).toEqual([]);
    expect(saveEventPlan(covered, { ...covered, serial_number: "LG-8842-B" })).toEqual([]);
  });

  it("publishes nothing when a never-covered item is merely renamed", () => {
    // The name moved, so the inputs changed, but there was never an entry to
    // move and none to take down.
    expect(saveEventPlan(uncovered, { ...uncovered, name: "Old dishwasher" })).toEqual([]);
  });

  it("moves the one entry when a covered item is renamed", () => {
    const plan = saveEventPlan(covered, { ...covered, name: "Kitchen dishwasher" });
    expect(types(plan)).toEqual(["warranty.expiry_scheduled"]);
    expect(plan[0].payload.review_title).toBe("Kitchen dishwasher warranty expires");
  });

  it("carries one source_ref_id across all three events, or retraction matches nothing", () => {
    const ref = itemSourceRefId(covered);
    expect(itemAddedPayload(covered).source_ref_id).toBe(ref);
    expect(expiryScheduledPayload(covered).source_ref_id).toBe(ref);
    expect(expiryCancelledPayload(covered, "deleted").source_ref_id).toBe(ref);
  });

  it("gives the calendar event a real date and an action-shaped title", () => {
    const payload = expiryScheduledPayload(covered);
    expect(payload.warranty_expires_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.review_title).toBe("LG Dishwasher warranty expires");
    expect(payload.summary).toContain("Home Depot");
    // The summary rides the household ICS feed out to Google and Apple.
    expect(JSON.stringify(payload)).not.toContain("LG-8842-A");
    expect(JSON.stringify(payload)).not.toContain("receipt in the drawer");
  });
});
