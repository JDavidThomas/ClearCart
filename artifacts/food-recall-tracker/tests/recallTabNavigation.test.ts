import assert from 'node:assert/strict';
import test from 'node:test';
import { getRecallResultTabAfterSwipe } from '../services/recallTabNavigation.ts';

test('horizontal swipes select the neighboring recall result tab', () => {
  assert.equal(getRecallResultTabAfterSwipe('fda', -80), 'news');
  assert.equal(getRecallResultTabAfterSwipe('news', 80), 'fda');
  assert.equal(getRecallResultTabAfterSwipe('fda', 80), 'fda');
  assert.equal(getRecallResultTabAfterSwipe('news', -80), 'news');
});

test('short horizontal movement does not switch recall result tabs', () => {
  assert.equal(getRecallResultTabAfterSwipe('fda', -51), 'fda');
  assert.equal(getRecallResultTabAfterSwipe('news', 51), 'news');
});