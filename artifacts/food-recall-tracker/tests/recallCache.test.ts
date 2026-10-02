import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isRecallNewsQueryCacheCurrent,
  isRecallSearchCacheFresh,
  RECALL_NEWS_QUERY_CACHE_VERSION,
  RECALL_EMPTY_NEWS_CACHE_TTL_MS,
  RECALL_SEARCH_CACHE_TTL_MS,
  shouldBypassEmptyNewsCache,
  shouldRefreshRecallNews,
} from '../services/recallCache.ts';

test('recall news cache versions invalidate older empty news searches once', () => {
  assert.equal(isRecallNewsQueryCacheCurrent(undefined), false);
  assert.equal(isRecallNewsQueryCacheCurrent(1), false);
  assert.equal(isRecallNewsQueryCacheCurrent(2), false);
  assert.equal(isRecallNewsQueryCacheCurrent(RECALL_NEWS_QUERY_CACHE_VERSION), true);
});

test('recall cache remains fresh through the 24-hour TTL', () => {
  const now = Date.parse('2026-09-27T12:00:00.000Z');
  const updatedAt = new Date(now - RECALL_SEARCH_CACHE_TTL_MS + 1).toISOString();

  assert.equal(isRecallSearchCacheFresh(updatedAt, now), true);
});

test('recall cache expires after 24 hours and rejects future timestamps', () => {
  const now = Date.parse('2026-09-27T12:00:00.000Z');

  assert.equal(
    isRecallSearchCacheFresh(
      new Date(now - RECALL_SEARCH_CACHE_TTL_MS - 1).toISOString(),
      now,
    ),
    false,
  );
  assert.equal(
    isRecallSearchCacheFresh(new Date(now + 1).toISOString(), now),
    false,
  );
  assert.equal(isRecallSearchCacheFresh('invalid timestamp', now), false);
});

test('empty news is cached for five minutes while non-empty news stays cached', () => {
  const now = Date.parse('2026-09-30T12:00:00.000Z');
  const checkedAt = new Date(now - RECALL_EMPTY_NEWS_CACHE_TTL_MS + 1).toISOString();

  assert.equal(shouldRefreshRecallNews(false, 0, checkedAt, now), false);
  assert.equal(
    shouldRefreshRecallNews(
      false,
      0,
      new Date(now - RECALL_EMPTY_NEWS_CACHE_TTL_MS).toISOString(),
      now,
    ),
    true,
  );
  assert.equal(shouldRefreshRecallNews(false, 2, checkedAt, now), false);
  assert.equal(shouldRefreshRecallNews(true, 0, checkedAt, now), true);
  assert.equal(shouldRefreshRecallNews(false, 0, undefined, now), true);
});

test('a cached empty result is bypassed for a term in recent searches', () => {
  assert.equal(shouldBypassEmptyNewsCache(0, true), true);
  assert.equal(shouldBypassEmptyNewsCache(0, false), false);
  assert.equal(shouldBypassEmptyNewsCache(1, true), false);
});