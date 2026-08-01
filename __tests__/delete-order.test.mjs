/**
 * The item row is the only record of its receipt's hub file id, and the file
 * storage reconciler only reaps R2 objects that have NO metadata row. Deleting
 * the row first and then the file therefore leaked the receipt's bytes against
 * the household's quota, permanently and unreclaimably, whenever the browser
 * went away in between (closed tab, dropped connection) — the file calls are
 * best-effort and unretried.
 *
 * Document and file go first now. The failure mode becomes a surviving row
 * with a dangling receipt id, which renders as "no receipt" and can be deleted
 * again.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const client = readFileSync(join(__dirname, "../src/index.html"), "utf-8");

describe("deleteItem", () => {
  const body = client.slice(client.indexOf("async function deleteItem("), client.indexOf("/** Upload a receipt file"));

  it("removes the hub document and file before the row that names them", () => {
    const doc = body.indexOf("method: \"DELETE\" }).catch");
    const file = body.indexOf("files.delete(item.receipt_file_id)");
    const row = body.indexOf("DELETE FROM app_warranty_vault__items");
    expect(doc).toBeGreaterThan(-1);
    expect(file).toBeGreaterThan(doc);
    expect(row).toBeGreaterThan(file);
  });
});
