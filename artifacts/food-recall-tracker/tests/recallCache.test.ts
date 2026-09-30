import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isRecallNewsQueryCacheCurrent,
  isRecallSearchCacheFresh,
  RECALL_NEWS_QUERY_CACHE_VERSION,
  RECALL_SEARCH_CACHE_TTL_MS,
} from '../services/recallCache.ts';

test('recall news cache versions invalidate older empty news searches once', () => {
  assert.equal(isRecallNewsQueryCacheCurrent(undefined), false);
  assert.equal(isRecallNewsQueryCacheCurrent(1), false);
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