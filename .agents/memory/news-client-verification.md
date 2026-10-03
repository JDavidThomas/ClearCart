---
name: News client verification gate
description: Required verification before claiming a Food Recall Tracker News fix works.
---

For News regressions, verify the target search through the client-side request, client state, and rendered News panel. A server-only response check does not qualify. Do not provide a fresh tunnel URL until this client-side verification passes. If the working flow cannot be reproduced client-side, say exactly: “The client-side news fetch is broken and I don't know why.”

**Why:** The user gave this requirement after repeated rounds where server-side success did not match the phone's empty News panel.

**How to apply:** Use this gate for future Food Recall Tracker news fixes; clearly distinguish headless/component checks from Expo Go or physical-device verification.