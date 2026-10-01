import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRecallResultPanelContent,
  getRecallResultTabAfterSwipe,
  getRecallResultTabIndex,
} from '../services/recallTabNavigation.ts';

test('the active tab selects the matching panel and index', () => {
  assert.equal(getRecallResultTabIndex('fda'), 0);
  assert.equal(getRecallResultTabIndex('news'), 1);
  assert.equal(getRecallResultPanelContent('fda', 'FDA panel', 'News panel'), 'FDA panel');
  assert.equal(getRecallResultPanelContent('news', 'FDA panel', 'News panel'), 'News panel');
});

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