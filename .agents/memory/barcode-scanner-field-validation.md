---
name: Barcode scanner field validation
description: Real package scans distinguish decoder reliability from product-catalog misses.
---

The user tested eight physical food barcodes: six were decoded successfully, while two decoded but had no Open Food Facts product record. A product-not-found result indicates catalog coverage, not a camera or barcode-decoding failure.

**Why:** The user confirmed this distinction on a phone; treating catalog misses as scanner bugs leads to unnecessary camera changes.

**How to apply:** When a barcode decodes but product lookup returns no record, provide a clear database-coverage message and search/photo alternatives instead of tuning the scanner.