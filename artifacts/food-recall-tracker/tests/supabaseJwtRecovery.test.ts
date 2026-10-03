import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseJwtRecoveryFetch } from '../lib/supabaseJwtRecovery.ts';

function futureIssuedJwtResponse() {
  return new Response(
    JSON.stringify({
      code: 'PGRST303',
      message: 'JWT issued at future',
    }),
    {
      status: 401,
      headers: { 'content-type': 'application/json' },
    },
  );
}

test('refreshes and retries a PostgREST request once after a future-issued JWT error', async () => {
  let refreshCount = 0;
  let requestCount = 0;
  let initialAuthorization: string | null = null;
  let retryAuthorization: string | null = null;
  const events: string[] = [];
  const fetchWithRecovery = createSupabaseJwtRecoveryFetch(
    async (reason) => {
      refreshCount += 1;
      events.push(`refresh:${reason}`);
      return reason === 'before-request'
        ? 'pre-request-session-token'
        : 'recovered-session-token';
    },
    async (input, init) => {
      requestCount += 1;
      events.push(`fetch:${requestCount}`);
      const headers = new Headers(
        input instanceof Request ? input.headers : undefined,
      );
      new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
      if (requestCount === 1) {
        initialAuthorization = headers.get('authorization');
        return futureIssuedJwtResponse();
      }
      retryAuthorization = headers.get('authorization');
      return new Response(JSON.stringify({ rows: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  );

  const response = await fetchWithRecovery(
    'https://project.supabase.co/rest/v1/profiles',
    { headers: { authorization: 'Bearer stale-session-token' } },
  );

  assert.equal(response.status, 200);
  assert.equal(requestCount, 2);
  assert.equal(refreshCount, 2);
  assert.deepEqual(events, [
    'refresh:before-request',
    'fetch:1',
    'refresh:jwt-future',
    'fetch:2',
  ]);
  assert.equal(initialAuthorization, 'Bearer pre-request-session-token');
  assert.equal(retryAuthorization, 'Bearer recovered-session-token');
});

test('refreshes an authenticated PostgREST request before the first fetch', async () => {
  const events: string[] = [];
  let requestAuthorization: string | null = null;
  const fetchWithRecovery = createSupabaseJwtRecoveryFetch(
    async (reason) => {
      events.push(`refresh:${reason}`);
      return 'preflight-session-token';
    },
    async (input, init) => {
      events.push('fetch');
      const headers = new Headers(
        input instanceof Request ? input.headers : undefined,
      );
      new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
      requestAuthorization = headers.get('authorization');
      return new Response(JSON.stringify({ rows: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  );

  const response = await fetchWithRecovery(
    'https://project.supabase.co/rest/v1/profiles',
    { headers: { authorization: 'Bearer stored-session-token' } },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(events, ['refresh:before-request', 'fetch']);
  assert.equal(requestAuthorization, 'Bearer preflight-session-token');
});

test('returns the original future-JWT response if both refresh attempts fail', async () => {
  let refreshCount = 0;
  let requestCount = 0;
  const fetchWithRecovery = createSupabaseJwtRecoveryFetch(
    async () => {
      refreshCount += 1;
      throw new Error('session refresh unavailable');
    },
    async () => {
      requestCount += 1;
      return futureIssuedJwtResponse();
    },
  );

  const response = await fetchWithRecovery(
    'https://project.supabase.co/rest/v1/profiles',
    { headers: { authorization: 'Bearer stored-session-token' } },
  );

  assert.equal(response.status, 401);
  assert.equal(refreshCount, 2);
  assert.equal(requestCount, 1);
});

test('does not refresh or retry unrelated PostgREST errors', async () => {
  let refreshCount = 0;
  let requestCount = 0;
  const fetchWithRecovery = createSupabaseJwtRecoveryFetch(
    async () => {
      refreshCount += 1;
      return 'fresh-session-token';
    },
    async () => {
      requestCount += 1;
      return new Response(
        JSON.stringify({ code: 'PGRST301', message: 'JWT expired' }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      );
    },
  );

  const response = await fetchWithRecovery(
    'https://project.supabase.co/rest/v1/profiles',
  );

  assert.equal(response.status, 401);
  assert.equal(requestCount, 1);
  assert.equal(refreshCount, 0);
});

test('does not recursively refresh auth-endpoint responses', async () => {
  let refreshCount = 0;
  let requestCount = 0;
  const fetchWithRecovery = createSupabaseJwtRecoveryFetch(
    async () => {
      refreshCount += 1;
      return 'fresh-session-token';
    },
    async () => {
      requestCount += 1;
      return futureIssuedJwtResponse();
    },
  );

  const response = await fetchWithRecovery(
    'https://project.supabase.co/auth/v1/token?grant_type=refresh_token',
  );

  assert.equal(response.status, 401);
  assert.equal(requestCount, 1);
  assert.equal(refreshCount, 0);
});