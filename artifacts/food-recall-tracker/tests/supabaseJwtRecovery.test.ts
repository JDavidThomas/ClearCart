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
  let retryAuthorization: string | null = null;
  const fetchWithRecovery = createSupabaseJwtRecoveryFetch(
    async () => {
      refreshCount += 1;
      return 'fresh-session-token';
    },
    async (_input, init) => {
      requestCount += 1;
      if (requestCount === 1) return futureIssuedJwtResponse();
      retryAuthorization = new Headers(init?.headers).get('authorization');
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
  assert.equal(refreshCount, 1);
  assert.equal(retryAuthorization, 'Bearer fresh-session-token');
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