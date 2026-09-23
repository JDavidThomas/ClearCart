declare module 'node:test' {
  type TestCallback = () => void | Promise<void>;
  const test: (name: string, callback: TestCallback) => void;
  export default test;
}

declare module 'node:assert/strict' {
  interface Assert {
    deepEqual(actual: unknown, expected: unknown): void;
    equal(actual: unknown, expected: unknown): void;
  }

  const assert: Assert;
  export default assert;
}