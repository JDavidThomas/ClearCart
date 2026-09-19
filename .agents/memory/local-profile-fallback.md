---
name: Local profile fallback
description: Current account behavior while the Supabase integration is not connected.
---

The app intentionally keeps recall features available to guests and stores the temporary profile/session locally on the device until Supabase is connected.

**Why:** The requested Supabase integration was not connected, but the guest-safe profile and allergen experience still needed to work end to end.

**How to apply:** Preserve the guest fallback and allergen UI contract; replace the local persistence layer with Supabase only when the integration is enabled.