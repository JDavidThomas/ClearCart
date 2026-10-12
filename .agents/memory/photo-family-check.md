---
name: Photo household checks
description: Keep household allergy checks independent from Open Food Facts product enrichment.
---

Evaluate family-member allergens from the identified product name and any available ingredient text immediately. Open Food Facts can add ingredient and nutrition evidence, but it must not gate or replace name-based household checks. When product data is missing, show the name-based result with a manual-verification warning rather than a clean bill of health.

**Why:** Photo identification already provides a usable product name, while third-party catalog coverage and response time vary. Waiting on catalog details can hide an obvious allergen conflict or leave the household check looking unfinished.

**How to apply:** Keep photo and text-search flows on the shared family allergen evaluator. Make family/profile and product-detail requests time-bounded, and preserve visible results while enrichment is pending or unavailable.
