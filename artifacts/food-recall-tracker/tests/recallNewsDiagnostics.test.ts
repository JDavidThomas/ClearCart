import assert from 'node:assert/strict';
import test from 'node:test';
import {
  customFetch,
  setBaseUrl,
} from '../../../lib/api-client-react/src/custom-fetch.ts';

test('news transport diagnostics report the exact URL, successful status, and raw count', async () => {
  const originalFetch = globalThis.fetch;
  const events: Array<{
    url: string;
    status: number | null;
    rawArticleCount: number | null;
    error: string | null;
  }> = [];
  const requestUrl =
    'https://news.example/api/recalls/news?term=Sierra+Nevada+Graziers';

  setBaseUrl('https://news.example');
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        articles: [{ title: 'One' }, { title: 'Two' }],
        unavailable: false,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );

  try {
    const response = await customFetch<{ articles: unknown[] }>(
      '/api/recalls/news?term=Sierra+Nevada+Graziers',
      { onRecallNewsDiagnostics: (diagnostics) => events.push(diagnostics) },
    );
    const latest = events.at(-1);

    assert.equal(response.articles.length, 2);
    assert.deepEqual(latest, {
      url: requestUrl,
      status: 200,
      rawArticleCount: 2,
      error: null,
    });
  } finally {
    globalThis.fetch = originalFetch;
    setBaseUrl(null);
  }
});

test('news transport diagnostics preserve HTTP failures and their status', async () => {
  const originalFetch = globalThis.fetch;
  const events: Array<{
    url: string;
    status: number | null;
    rawArticleCount: number | null;
    error: string | null;
  }> = [];

  setBaseUrl('https://news.example');
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'upstream unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });

  try {
    let requestError: unknown;
    try {
      await customFetch('/api/recalls/news?term=cheese', {
        onRecallNewsDiagnostics: (diagnostics) => events.push(diagnostics),
      });
    } catch (error) {
      requestError = error;
    }
    if (!(requestError instanceof Error)) {
      throw new Error('The failed request did not reject with an Error.');
    }
    if (!requestError.message.includes('HTTP 503')) {
      throw new Error(`Expected the HTTP status in the error, received: ${requestError.message}`);
    }
    const latest = events.at(-1);

    assert.equal(latest?.url, 'https://news.example/api/recalls/news?term=cheese');
    assert.equal(latest?.status, 503);
    assert.equal(latest?.rawArticleCount, null);
    if (!(latest?.error ?? '').includes('HTTP 503')) {
      throw new Error(`Expected the diagnostic error to include HTTP 503, received: ${latest?.error}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    setBaseUrl(null);
  }
});