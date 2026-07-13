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
