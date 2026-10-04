---
name: Expo Camera SDK alignment
description: The Expo Camera package version that matches this project's Expo SDK.
---

This project uses Expo SDK 57, and the compatible camera package available in the workspace registry is `expo-camera` 57.0.5.

In this package version, `CameraView` uses the lowercase `autofocus` prop (`'on' | 'off'`), not `autoFocus`; its documented default is off, and `'on'` triggers one-shot focus. The TypeScript docs label it iOS-only, but Android also maps it to native focus metering. The supported barcode types include both `upc_a` and `ean13`, and device callbacks can report either.

**Why:** Expo Camera 57.0.5's TypeScript platform annotation and Android native implementation differ, so checking the public type alone can give an incomplete answer about autofocus support.

**How to apply:** Keep future camera-related changes on the SDK 57 package line, verify props against the installed types and native implementation when platform behavior matters, and run the app-local Expo dependency check after native package changes.