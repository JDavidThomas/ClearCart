---
name: Supabase profile sync
description: Cloud-backed profile behavior and guest fallback for the Food Recall Tracker.
---

The app uses Supabase Auth for profile sessions and stores only the access/refresh session tokens locally on the device. Recall checks remain available to guests if the profile service is unavailable.

**Why:** Personalized allergen alerts need a durable account, while public recall checks must continue working during auth outages.

**How to apply:** Keep auth requests server-mediated with Supabase secrets. On auth failures, clear the session, show a small notice, and preserve guest access.