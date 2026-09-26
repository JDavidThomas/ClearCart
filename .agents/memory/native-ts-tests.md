---
name: Native TypeScript tests in Expo packages
description: The mobile package can run dependency-free Node TypeScript tests with Node's native type stripping.
---

Use Node's native TypeScript test runner for pure service tests in the Expo package instead of adding a test framework or Node runtime dependency. Node's ESM runner also requires explicit `.ts` extensions for relative runtime imports.

**Why:** The package does not include Node typings, and adding them through the workspace package manager can target the workspace root. Ambient declarations for the small `node:test` and `node:assert/strict` surface keep the production dependency graph unchanged.

**How to apply:** Add a package-local test script using `node --experimental-strip-types --test`, keep tests focused on pure modules, add only the minimal test-only declarations needed for typechecking, and use `.ts` extensions for relative imports used by the runner.