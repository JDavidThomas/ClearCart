import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeFsisRecallRecords } from '../services/fsisRecallData.ts';

test('normalizes active FSIS API records and skips closed or older recalls', () => {
  const now = Date.parse('2026-09-26T12:00:00Z');
  const recalls = normalizeFsisRecallRecords(
    [
      {
        field_title:
          'Sempio Food Services Inc. Recalls Ready-To-Eat Chicken Stew Products',
        field_recall_number_export: '024-2026',
        field_recall_url: 'http://www.fsis.usda.gov/recalls-alerts/sempio-recall',
        field_recall_type: 'Active Recall',
        field_establishment: [],
        field_recall_reason: ['Import Violation'],
        field_recall_date: '2026-09-25',
        field_recall_classification: 'Class I',
        field_summary: '<p>May be contaminated &amp; should not be eaten.</p>',
        field_related_to_outbreak: 'False',
      },
      {
        field_title: 'Closed Foods Recalls Frozen Meals',
        field_recall_type: 'Terminated Recall',
        field_recall_date: '2026-09-24',
      },
      {
        field_title: 'Old Foods Recalls Canned Soup',
        field_recall_type: 'Active Recall',
        field_recall_date: '2025-08-01',
      },
    ],
    now,
  );

  assert.deepEqual(recalls, [
    {
      id: '024-2026',
      productName: 'Sempio Food Services Inc. Recalls Ready-To-Eat Chicken Stew Products',
      companyName: 'Sempio Food Services Inc.',
      reason: 'Import Violation',
      date: '2026-09-25',
      classification: 'Class I',
      summary: 'May be contaminated & should not be eaten.',
      officialUrl: 'https://www.fsis.usda.gov/recalls-alerts/sempio-recall',
      recallType: 'Active Recall',
      relatedToOutbreak: false,
    },
  ]);
});