---
name: Frequently Bought persistence
description: Data-model choice for saved items that must outlive active shopping-list rows.
---

Store Frequently Bought entries independently from active shopping-list rows. The active list is disposable working state: removing or clearing an active row must not delete a saved frequent item. Quick-add should create a new unchecked active row and rerun current safety checks rather than restoring an old checked result.

**Why:** A favorite flag on a row that is deleted with the active list cannot preserve a reusable item without adding a second state such as active/inactive.

**How to apply:** Keep frequent-item ownership and row-level security scoped to the signed-in user; copy only the search term into a newly checked active row when the user adds it back.
