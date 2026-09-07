import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf-8"));

describe("manifest.json", () => {
  it("has required string fields", () => {
    for (const field of ["id", "name", "version", "description", "entrypoint", "runtime", "icon"]) {
      expect(manifest[field], `missing field: ${field}`).toBeTruthy();
    }
  });
  it("entrypoint/runtime/storage are standard", () => {
    expect(manifest.entrypoint).toBe("index.html");
    expect(manifest.runtime).toBe("static");
    expect(manifest.storage).toBe("db");
  });
  it("version follows semver", () => expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/));
  it("has a nav label", () => expect(manifest.nav?.label).toBeTruthy());

  it("items table is adult_writable", () => {
    expect(manifest.row_policies?.items?.kind).toBe("adult_writable");
  });

  it("the file + document write channels are gated to adults, matching the table policy", () => {
    expect(manifest.file_acls?.write?.require_role).toBe("adult");
    expect(manifest.document_acls?.write?.require_role).toBe("adult");
  });

  it("SQL-filtered date columns are declared plaintext", () => {
    expect(manifest.db_plaintext_columns).toContain("purchase_date");
    expect(manifest.db_plaintext_columns).toContain("warranty_expires_date");
  });

  it("ai exports match the query files", () => {
    expect(manifest.ai_access?.db_exports).toEqual(["items"]);
  });

  it("every published event is gated the same way its siblings are", () => {
    // A publish with no acl entry is not offered the adult gate the items table
    // itself carries, so the two must be added together.
    for (const name of manifest.publishes ?? []) {
      expect(manifest.publish_acls?.[name]?.require_role, `ungated publish: ${name}`).toBe("adult");
    }
  });

  it("every suggestion's trigger is an event this app actually publishes", () => {
    // The hub only offers a suggestion whose trigger has an installed
    // publisher, so a trigger missing from `publishes` is a suggestion nobody
    // can ever turn on.
    for (const s of manifest.suggested_automations ?? []) {
      expect(manifest.publishes, `unpublished trigger: ${s.trigger_event}`).toContain(s.trigger_event);
    }
  });

  it("every calendar suggestion maps the params the calendar action requires", () => {
    // create_event requires title and event_date; without a stable
    // source_ref_id an edited warranty lands a SECOND entry beside the stale
    // one, and the retraction can never find what it made.
    const toCalendar = (manifest.suggested_automations ?? []).filter((s) => s.target_app_id === "calendar");
    expect(toCalendar.length).toBeGreaterThan(0);
    for (const s of toCalendar) {
      expect(s.param_map?.source_ref_id?.value, `${s.action_id} has no source_ref_id`).toBe("source_ref_id");
    }
    const create = toCalendar.find((s) => s.action_id === "create_event");
    expect(create?.param_map?.title?.value).toBe("review_title");
    expect(create?.param_map?.event_date?.value).toBe("warranty_expires_date");
    // Deliberately NOT warranty.item_added. That event fires for every insert,
    // including items with no warranty at all, whose empty expiry would reach
    // the runner as a missing required param and fail the run.
    expect(create?.trigger_event).toBe("warranty.expiry_scheduled");
    expect(create?.param_map?.description?.value).toBe("summary");
  });

  it("ships the retraction half, or the entry outlives the item", () => {
    const retract = (manifest.suggested_automations ?? []).find((s) => s.action_id === "retract_dated_event");
    expect(retract?.trigger_event).toBe("warranty.expiry_cancelled");
    expect(retract?.target_app_id).toBe("calendar");
    expect(retract?.param_map?.source_ref_id?.value).toBe("source_ref_id");
  });
});
