---
name: Supabase publishable keys
description: Compatibility finding for Supabase publishable API keys in the mobile client.
---

Supabase JS 2.116.0 accepts `sb_publishable_...` keys as the client API key; a signup/profile failure is not by itself evidence that the app needs the legacy JWT anon key.

**Why:** A device signup investigation initially suspected the newer key format, but the installed SDK documents publishable-key usage and the device reached Supabase signup successfully.

**How to apply:** Log redacted configuration metadata and the structured Supabase error first. Do not swap to a different key merely because the key does not begin with `eyJ`.