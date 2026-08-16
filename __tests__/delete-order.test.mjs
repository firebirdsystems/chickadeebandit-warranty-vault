/**
 * The item row is the only record of its receipt's hub file id, and the file
 * storage reconciler only reaps R2 objects that have NO metadata row. So a
 * client that deletes the row and then the file leaks the receipt's bytes
 * against the household's quota — permanently and unreclaimably — whenever the
 * browser goes away in between (closed tab, dropped connection), because the
 * file calls are best-effort and unretried.
 *
 * This app used to mitigate that by ordering the file delete BEFORE the row
 * delete, trading a byte leak for a dangling receipt id. It no longer has to
 * choose: `manifest.delete_file_columns.items` names `receipt_file_id`, so the
 * hub reads the id off the doomed row and queues the R2 reclaim inside the
 * DELETE's own transaction. Neither ordering can lose the bytes now.
 *
 * These tests pin that the client no longer reclaims the receipt by hand — a
 * reintroduced `files.delete` here would be the leak coming back, since it
 * would once again be the only thing standing between an interrupted request
 * and an orphan.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const client = readFileSync(join(__dirname, "../src/index.html"), "utf-8");
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf-8"));

describe("deleteItem", () => {
  const body = client.slice(client.indexOf("async function deleteItem("), client.indexOf("/** Upload a receipt file"));

  it("declares the receipt file column so the hub reclaims it transactionally", () => {
    expect(manifest.delete_file_columns?.items).toContain("receipt_file_id");
  });

  it("does not reclaim the receipt file from the client", () => {
    expect(body).not.toContain("files.delete");
  });

  it("still removes the hub document before the row that names it", () => {
    // The hub document is a separate lane with its own record, not covered by
    // delete_file_columns — it keeps the ordering it always had.
    const doc = body.indexOf('method: "DELETE" }).catch');
    const row = body.indexOf("DELETE FROM app_warranty_vault__items");
    expect(doc).toBeGreaterThan(-1);
    expect(row).toBeGreaterThan(doc);
  });

  it("deletes the item as a single statement, which the declaration requires", () => {
    // A declared table's DELETE cannot go through the /api/db batch form — the
    // hub refuses it rather than silently skipping the reclaim.
    expect(body).toContain('await db("DELETE FROM app_warranty_vault__items WHERE id = ?", [id])');
  });
});
