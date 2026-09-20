---
name: Supabase network probe
description: Distinguish an invalid Supabase hostname from Expo tunnel or container networking.
---

The mobile Supabase client uses direct native fetch; Expo tunnel settings do not proxy its external requests. A public DNS `NXDOMAIN` result for the configured Supabase host means the URL/project reference is wrong or no longer exists.

**Why:** The same `UnknownHostException` on Wi-Fi and mobile data, combined with public DNS status 3, rules out the Metro tunnel and points to the configured project URL.

**How to apply:** Copy the exact Project URL from Supabase Settings → API into the Expo public URL secret, keep the mobile client direct, then restart Metro with a cleared cache.