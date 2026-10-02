import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterRecentNews,
  getRecentNewsPanelState,
} from '../services/recallNewsFilters.ts';
import type { RecallNewsArticle } from '../types/recall.ts';

const now = Date.parse('2026-09-30T12:00:00.000Z');

function article(title: string, publishedAt: string): RecallNewsArticle {
  return {
    title,
    source: 'Example News',
    url: `https://news.example/${encodeURIComponent(title)}`,
    publishedAt,
  };
}

test('news panel only treats an explicit true flag as unavailable', () => {
  assert.equal(getRecentNewsPanelState(1, true), 'articles');
  assert.equal(getRecentNewsPanelState(1, undefined), 'articles');
  assert.equal(getRecentNewsPanelState(0, true), 'unavailable');
  assert.equal(getRecentNewsPanelState(0, false), 'empty');
  assert.equal(getRecentNewsPanelState(0, undefined), 'empty');
});

test('recent news uses a 30-day window, sorts newest first, and caps at three', () => {
  const result = filterRecentNews(
    [
      article('Older than 30 days', '2026-08-31T11:59:59.000Z'),
      article('Third newest', '2026-09-20T12:00:00.000Z'),
      article('Newest', '2026-09-30T11:00:00.000Z'),
      article('Second newest', '2026-09-28T12:00:00.000Z'),
      article('Future article', '2026-10-01T00:00:00.000Z'),
      article('Fourth newest', '2026-09-18T12:00:00.000Z'),
    ],
    now,
  );

  assert.deepEqual(
    result.map((item) => item.title),
    ['Newest', 'Second newest', 'Third newest'],
  );
});