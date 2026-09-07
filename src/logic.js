/**
 * Pure business logic for the Warranty Vault app.
 * No DOM, no fetch — importable in both browser and test environments.
 */

export const CATEGORIES = [
  { value: "electronics", label: "Electronics", icon: "📱" },
  { value: "appliances",  label: "Appliances",  icon: "🫧" },
  { value: "furniture",   label: "Furniture",   icon: "🛋️" },
  { value: "tools",       label: "Tools",       icon: "🛠️" },
  { value: "outdoor",     label: "Outdoor",     icon: "🌳" },
  { value: "other",       label: "Other",       icon: "📦" },
];

const CAT_BY_VALUE = new Map(CATEGORIES.map((c) => [c.value, c]));

export function categoryMeta(v) {
  return CAT_BY_VALUE.get(v) ?? { value: "other", label: "Other", icon: "📦" };
}

function atMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * Warranty expiry ISO date from a purchase date + coverage months,
 * clamping the day to the target month's length. Empty string when unknown.
 */
export function warrantyExpiryDate(purchaseIso, warrantyMonths) {
  const months = Number(warrantyMonths);
  if (!purchaseIso || !Number.isFinite(months) || months <= 0) return "";
  const d = new Date(`${purchaseIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const targetMonth = d.getMonth() + months;
  const year = d.getFullYear() + Math.floor(targetMonth / 12);
  const monthIndex = targetMonth % 12;
  const daysInTarget = new Date(year, monthIndex + 1, 0).getDate();
  const day = Math.min(d.getDate(), daysInTarget);
  const pad = (n) => String(n).padStart(2, "0");
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

/** Whole days from `from` until an ISO date (negative = past). Null if unset. */
export function daysUntilDate(iso, from = new Date()) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((atMidnight(d) - atMidnight(from)) / 86400000);
}

/** "active" | "expiring" (≤ 60 days) | "expired" | "none". */
export function warrantyStatus(item, from = new Date()) {
  const days = daysUntilDate(item.warranty_expires_date, from);
  if (days == null) return "none";
  if (days < 0) return "expired";
  if (days <= 60) return "expiring";
  return "active";
}

/** "Expired Mar 2026" / "43 days left" / "2 years left" / "No warranty". */
export function warrantyLabel(item, from = new Date()) {
  const days = daysUntilDate(item.warranty_expires_date, from);
  if (days == null) return "No warranty";
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days <= 90) return `${days} day${days === 1 ? "" : "s"} left`;
  if (days < 365 * 2) return `${Math.round(days / 30)} months left`;
  return `${Math.round(days / 365)} years left`;
}

/**
 * Items sorted for the list view: expiring-soonest active warranties first,
 * then no-warranty items by name, expired last.
 */
export function sortedItems(items, from = new Date()) {
  const rank = { expiring: 0, active: 1, none: 2, expired: 3 };
  return [...items]
    .map((i) => ({ ...i, _status: warrantyStatus(i, from), _days: daysUntilDate(i.warranty_expires_date, from) }))
    .sort((a, b) => {
      const r = rank[a._status] - rank[b._status];
      if (r !== 0) return r;
      if (a._days != null && b._days != null && a._days !== b._days) return a._days - b._days;
      return String(a.name).localeCompare(String(b.name));
    });
}

/** Parse a user-entered dollar amount to integer cents; null if empty/invalid. */
export function parseMoneyToCents(raw) {
  const s = String(raw ?? "").replace(/[$,\s]/g, "");
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/**
 * Fields the in-app search matches against (see hub-sdk `searchMatch`). Serial
 * number and notes are included deliberately: a warranty claim usually starts
 * from a serial on the device itself, not from what the item was named here.
 */
export function searchableFields(item) {
  return [item.name, item.retailer, item.category, item.serial_number, item.notes];
}

/* ── Calendar automation ───────────────────────────────────────────────────── */

/**
 * Steady identity for whatever this item puts on another app's surface — the
 * calendar entry, today, and anything keyed the same way later.
 *
 * The event id is fresh on every publish, so it can only say "this is a new
 * event", never "this is the same item as last time". Without a stable ref an
 * edited warranty length lands a SECOND calendar entry beside the stale first
 * one, and a deletion can never find what it made. Namespaced by app because
 * the column it lands in is shared with every other publisher's refs.
 */
export function itemSourceRefId(item) {
  return `warranty-vault:${item.id}`;
}

/**
 * Whether an item has an expiry worth putting on the calendar.
 *
 * An item with no warranty months has an empty `warranty_expires_date`, and an
 * empty string is not "no value" to the automation runner — it is a MISSING
 * required param, which fails the whole run. So the publish is guarded here
 * rather than left for the calendar to reject.
 */
export function wantsExpiryEntry(item) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(item?.warranty_expires_date ?? ""));
}

/**
 * Why an edit stopped an item from wanting a calendar entry, or null if it
 * still wants one (or never did).
 *
 * The transition is what matters, not the end state: an item that never
 * announced anything has nothing to retract, and publishing for one would
 * spend an automation run to update zero rows — and rules are rate limited per
 * day. Announcing is the opposite, because the calendar upserts on
 * `source_ref_id`, so re-announcing is free.
 */
export function expiryRetractionReason(prev, next) {
  if (!prev || !wantsExpiryEntry(prev) || wantsExpiryEntry(next)) return null;
  return "cover_removed";
}

/**
 * Whether an edit touched anything the calendar entry is built from.
 *
 * Only the expiry date — which decides the day and whether there is an entry
 * at all — and the name, which is the entry's title. A corrected serial number
 * or a line added to the notes must not re-announce: the entry it would
 * rewrite is already correct, and the run is spent for nothing.
 *
 * `name` is included here where the sibling apps deliberately leave it out.
 * Those announce a recurring cycle, so a rename shows up on the next one for
 * free. A warranty expires exactly once, so a name fixed after the fact would
 * otherwise sit misspelled on the calendar until cover lapsed. Re-announcing
 * is an upsert on the same ref, so the corrected title moves the one entry
 * rather than adding a second.
 */
export function expiryInputsChanged(prev, next) {
  if (!prev) return true;
  return ["warranty_expires_date", "name"]
    .some((k) => String(prev[k] ?? "") !== String(next[k] ?? ""));
}

/** Calendar entry title: an action to take, not a bare product name. Cover
 *  lapsing is only worth a calendar day if it reads as "do something now". */
export function expiryReviewTitle(item) {
  return `${item.name} warranty expires`;
}

/**
 * Second line of the calendar entry: what the thing is and where it came from,
 * which is what a claim starts from.
 *
 * Deliberately no `notes` and no `serial_number`. This text leaves the
 * household through whatever the calendar entry feeds — the household ICS feed
 * reaches Google and Apple — and a serial is exactly the credential a claim is
 * made with. Category and retailer already show household-wide in the list and
 * the agenda, so neither is a new disclosure.
 */
export function expirySummary(item) {
  const parts = [categoryMeta(item.category).label];
  if (item.retailer) parts.push(item.retailer);
  if (item.purchase_date) parts.push(`purchased ${item.purchase_date}`);
  return parts.join(" · ");
}

/**
 * Payload for `warranty.item_added` — the app's standing "an item was added"
 * contract. Every insert publishes it, warranty or not.
 *
 * `warranty_expires_date` rides along for consumers that want it, but this
 * event is NOT the calendar lane: it can carry an empty expiry, and an empty
 * string is a MISSING required param to the automation runner rather than an
 * absent optional. Narrowing this event to items with cover would have been
 * the easy fix and the wrong one — it would silently drop no-warranty items
 * out of every rule already keyed on "an item was added". The calendar gets
 * its own event instead; see expiryScheduledPayload.
 */
export function itemAddedPayload(item) {
  return {
    // Shared with warranty.expiry_scheduled and warranty.expiry_cancelled, so
    // whatever an entry was made from, the retraction still matches it.
    source_ref_id: itemSourceRefId(item),
    name: item.name,
    category: item.category,
    purchase_date: item.purchase_date,
    warranty_expires_date: item.warranty_expires_date,
    created_by: item.created_by,
  };
}

/**
 * Payload for `warranty.expiry_scheduled` — the calendar lane. Only ever
 * published for an item that passes `wantsExpiryEntry`, so `event_date` is
 * always a real day the runner can use.
 */
export function expiryScheduledPayload(item) {
  return {
    source_ref_id: itemSourceRefId(item),
    name: item.name,
    warranty_expires_date: item.warranty_expires_date,
    review_title: expiryReviewTitle(item),
    summary: expirySummary(item),
  };
}

/**
 * The events one save publishes, in order. `prev` is null for an insert.
 *
 * Two lanes on purpose. `warranty.item_added` answers "an item was added" and
 * fires on every insert. `warranty.expiry_scheduled` answers "this cover ends
 * on this day" and fires only for a real date — on insert, and again on an
 * edit that moved the date or the title. An edit never re-publishes
 * item_added: the item was added once, and saying so twice would double every
 * rule counting inventory.
 *
 * A cosmetic edit publishes nothing at all. Announcing is an upsert on
 * `source_ref_id` so repeating it is harmless, but every publish is an
 * automation run against a per-day rate limit, and rewriting an entry that is
 * already correct spends one for nothing.
 */
export function saveEventPlan(prev, next) {
  if (!prev) {
    const plan = [{ type: "warranty.item_added", payload: itemAddedPayload(next) }];
    if (wantsExpiryEntry(next)) {
      plan.push({ type: "warranty.expiry_scheduled", payload: expiryScheduledPayload(next) });
    }
    return plan;
  }
  if (!expiryInputsChanged(prev, next)) return [];
  const reason = expiryRetractionReason(prev, next);
  if (reason) return [{ type: "warranty.expiry_cancelled", payload: expiryCancelledPayload(next, reason) }];
  if (wantsExpiryEntry(next)) {
    return [{ type: "warranty.expiry_scheduled", payload: expiryScheduledPayload(next) }];
  }
  // Renamed an item that never had cover: nothing was ever on the calendar to
  // move, and nothing is there to take down.
  return [];
}

/**
 * Payload for `warranty.expiry_cancelled`. Carries the source_ref_id the
 * announcement used — that is the whole mechanism: the calendar's retraction
 * is scoped by it, and a mismatch would silently retract nothing.
 */
export function expiryCancelledPayload(item, reason) {
  return {
    source_ref_id: itemSourceRefId(item),
    name: item.name,
    reason,
  };
}
