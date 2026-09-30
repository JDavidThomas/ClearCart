import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addOpenFdaReportDateRange,
  getOpenFdaReportDateRange,
} from '../services/openFdaDateRange.ts';

test('OpenFDA report_date range rolls back six calendar months', () => {
  const range = getOpenFdaReportDateRange(new Date('2026-09-30T18:25:00.000Z'));

  assert.deepEqual(range, { from: '20260330', to: '20260930' });
  assert.equal(
    addOpenFdaReportDateRange('product_description:"eggs"', range),
    'product_description:"eggs" AND report_date:[20260330 TO 20260930]',
  );
});

test('six-month range clamps to the last day of shorter target months', () => {
  assert.deepEqual(
    getOpenFdaReportDateRange(new Date('2026-08-31T00:00:00.000Z')),
    { from: '20260228', to: '20260831' },
  );
});