import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FDA_DNS_RETRY_DELAY_MS,
  FdaDnsResolutionError,
  FdaNetworkError,
  fetchOpenFdaWithDnsRetry,
} from '../services/openFdaNetwork.ts';

test('OpenFDA retries one DNS failure after a two-second delay', async () => {
  let calls = 0;
  const delays: number[] = [];
  const response = await fetchOpenFdaWithDnsRetry('https://api.fda.gov/food/enforcement.json', {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        throw new TypeError(
          "fetch failed: java.net.UnknownHostException: Unable to resolve host 'api.fda.gov'",
        );
      }
      return new Response('{"results":[]}', { status: 200 });
    },
    delay: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [FDA_DNS_RETRY_DELAY_MS]);
});

test('OpenFDA stops after the single DNS retry also fails', async () => {
  let calls = 0;
  let delayCount = 0;
  let failure: unknown;

  try {
    await fetchOpenFdaWithDnsRetry('https://api.fda.gov/food/enforcement.json', {
      fetchImpl: async () => {
        calls += 1;
        throw new Error('java.net.UnknownHostException: api.fda.gov');
      },
      delay: async () => {
        delayCount += 1;
      },
    });
  } catch (error) {
    failure = error;
  }

  assert.equal(failure instanceof FdaDnsResolutionError, true);
  assert.equal(calls, 2);
  assert.equal(delayCount, 1);
});

test('OpenFDA does not retry unrelated network failures', async () => {
  let calls = 0;
  let delayCount = 0;
  let failure: unknown;

  try {
    await fetchOpenFdaWithDnsRetry('https://api.fda.gov/food/enforcement.json', {
      fetchImpl: async () => {
        calls += 1;
        throw new TypeError('Network request failed');
      },
      delay: async () => {
        delayCount += 1;
      },
    });
  } catch (error) {
    failure = error;
  }

  assert.equal(failure instanceof FdaNetworkError, true);
  assert.equal(calls, 1);
  assert.equal(delayCount, 0);
});