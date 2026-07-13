# Warranty Vault

Purchases, receipt photos, serial numbers, and warranty expiry tracking —
"when did we buy the dishwasher and is it still covered?"

- **Storage:** D1 (`app_warranty_vault__items`) + hub files/documents for
  receipt uploads (folder "Warranties").
- **Access:** `adult_writable`; `file_acls`/`document_acls` write gates match
  (adults only).
- **Money:** integer cents (`price_cents`).
- **AI:** read-only export `items` (serial numbers intentionally excluded).

## Develop

```bash
make install
make dev
make test
make build
```
