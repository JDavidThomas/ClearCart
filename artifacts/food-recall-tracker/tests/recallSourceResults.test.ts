import assert from 'node:assert/strict';
import test from 'node:test';
import type { FoodRecall } from '../types/recall.ts';
import { combineRecallSourceResults } from '../services/recallSourceResults.ts';

const fdaRecall: FoodRecall = {
  productDescription: 'Grade A Shell Eggs',
  reasonForRecall: 'Potential Salmonella contamination',
  recallingFirm: 'Example Farms',
  recallDate: '20260901',
  classification: 'Class I',
  officialUrl: 'https://www.fda.gov/safety/recalls',
  source: 'FDA',
};

const fsisRecall: FoodRecall = {
  productDescription: 'Ground Beef',
  reasonForRecall: 'Potential E. coli contamination',
  recallingFirm: 'Example Meats',
  recallDate: '20260902',
  classification: 'Class I',
  officialUrl: 'https://www.fsis.usda.gov/recalls',
  source: 'USDA FSIS',
};

test('FDA recalls remain visible when FSIS is unavailable', () => {
  const result = combineRecallSourceResults(
    { status: 'fulfilled', value: [fdaRecall] },
    {
      status: 'fulfilled',
      value: { recalls: [], sourceUnavailable: 'fsis' },
    },
  );

  assert.deepEqual(result.recalls, [fdaRecall]);
  assert.equal(result.sourceUnavailable, 'fsis');
  assert.equal(result.fdaUnavailable, undefined);
});

test('successful FDA and FSIS results are combined', () => {
  const result = combineRecallSourceResults(
    { status: 'fulfilled', value: [fdaRecall] },
    { status: 'fulfilled', value: { recalls: [fsisRecall] } },
  );

  assert.deepEqual(result.recalls, [fdaRecall, fsisRecall]);
  assert.equal(result.sourceUnavailable, undefined);
});

test('FSIS remains reportable when the FDA request also fails', () => {
  const result = combineRecallSourceResults(
    { status: 'rejected', reason: new Error('FDA unavailable') },
    {
      status: 'fulfilled',
      value: { recalls: [], sourceUnavailable: 'fsis' },
    },
  );

  assert.deepEqual(result.recalls, []);
  assert.equal(result.sourceUnavailable, 'fsis');
  assert.equal(result.fdaUnavailable, true);
});