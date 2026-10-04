---
name: News client verification gate
description: Required verification before claiming a Food Recall Tracker News fix works.
---

For News regressions, verify the target search in Expo Go on a physical phone—not only in a browser—through the client-side request, client state, and rendered News panel. Check the request URL, HTTP status, error, raw and filtered counts, and that displayed articles link to direct publisher pages. A server-only response check does not qualify. Do not provide a fresh tunnel URL until this client-side verification passes. If the working flow cannot be reproduced client-side, say exactly: “The client-side news fetch is broken and I don't know why.”

**Why:** The user confirmed that native Expo Go on their phone—not Chrome—is the authoritative check; previous server-side success did not match the phone's News panel.

**How to apply:** Use this gate for future Food Recall Tracker news fixes. Clearly distinguish API or browser checks from verified Expo Go behavior, and report any screen details that were not visible in the evidence.