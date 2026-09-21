---
name: Supabase storage bucket casing
description: Storage bucket identifiers are case-sensitive across client calls and SQL policies.
---

Use the exact Supabase Storage bucket ID everywhere. A casing difference between `storage.from(...)` and `storage.objects` RLS policies produces misleading upload failures such as “Bucket not found” or denied access.

**Why:** Supabase treats bucket IDs as exact strings; changing only the client or only the policy leaves the upload path inconsistent.

**How to apply:** Copy the bucket ID from Supabase Storage, then keep that exact spelling in the mobile client, schema/policy SQL, and any setup instructions.