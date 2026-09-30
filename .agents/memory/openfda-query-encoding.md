---
name: OpenFDA query encoding
description: Live OpenFDA search behavior for quoted terms and OR separators.
---

OpenFDA search parameters should use quoted field terms joined by ` OR `, then URL-encode the spaces as `%20` (or standard form encoding). A literal `%2BOR%2B` decodes to plus signs in the search expression and returned `NOT_FOUND` for banana and guacamole in live checks. A quoted single-term query found guacamole records even when the broader quoted OR query did not.

For `report_date` range queries, use compact `YYYYMMDD` bounds such as `report_date:[20260330 TO 20260930]`. A live food-enforcement query accepted this form with `sort=report_date:desc` and returned records within the requested six-month window.

**Why:** Treating literal plus signs as an OR operator caused clean no-match responses for known products, so the separator must be validated against actual endpoint behavior rather than assumed from its URL spelling.

**How to apply:** Try the exact quoted phrase before broader alternatives, encode the `OR` separator as whitespace, use compact date bounds for `report_date`, and treat HTTP 404 as no matches while continuing other search strategies.