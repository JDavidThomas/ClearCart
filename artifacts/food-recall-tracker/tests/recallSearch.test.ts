import assert from 'node:assert/strict';
import test from 'node:test';
import type { FoodRecall } from '../types/recall.ts';
import { rankAndFilterRecalls } from '../services/recallRelevance.ts';
import {
  buildOpenFdaFieldSearchQueries,
  buildOpenFdaSearchQuery,
  buildRecallSearchStrategies,
} from '../services/recallSearch.ts';

test('recall searches try the recalling firm before product descriptions', () => {
  const strategies = buildRecallSearchStrategies('Martina', { productType: 'Mangoes' });

  assert.equal(strategies[0].field, 'recalling_firm');
  assert.equal(strategies[0].query, 'recalling_firm:"Martina"');
  assert.equal(
    strategies.some(
      (strategy) =>
        strategy.field === 'product_description' &&
        strategy.term === 'Mangoes' &&
        strategy.query === 'product_description:"Mangoes"',
    ),
    true,
  );
});

test('multiword firm searches keep an exact phrase and a flexible token fallback', () => {
  assert.deepEqual(buildOpenFdaFieldSearchQueries('recalling_firm', 'Midwest Poultry'), [
    'recalling_firm:"Midwest Poultry"',
    'recalling_firm:"Midwest" OR recalling_firm:"Poultry"',
  ]);
});

test('OpenFDA alternatives are quoted, URL-safe, and deduplicated', () => {
  assert.deepEqual(
    buildOpenFdaFieldSearchQueries('product_description', 'guacamole'),
    [
      'product_description:"guacamole"',
      'product_description:"guacamole" OR product_description:"guacamoles"',
    ],
  );
  assert.equal(
    buildOpenFdaSearchQuery('guacamole'),
    'product_description:"guacamole" OR product_description:"guacamoles"',
  );
  const encodedSearch = new URLSearchParams({
    search: buildOpenFdaSearchQuery('guacamole'),
  })
    .toString()
    .replace(/\+/g, '%20');
  assert.equal(/%20OR%20/.test(encodedSearch), true);
  assert.equal(
    buildOpenFdaSearchQuery('xyzabc'),
    'product_description:"xyzabc" OR product_description:"xyzabcs"',
  );
});

test('recall relevance can match a firm name even when the product text differs', () => {
  const recall: FoodRecall = {
    productDescription: 'Grade A White In-shell Chicken Eggs',
    reasonForRecall: 'Potential Salmonella contamination',
    recallingFirm: 'MIDWEST POULTRY SERVC C/O H & LELECTRIC',
    recallDate: '20260819',
    classification: 'Class I',
    status: 'Terminated',
    officialUrl: 'https://www.fda.gov/safety/recalls',
    source: 'FDA',
  };

  const results = rankAndFilterRecalls([recall], 'Midwest Poultry');
  assert.equal(results.length, 1);
  assert.equal(results[0].relevance, 'high');
});

test('brand and product terms can match different parts of a recall record', () => {
  const recall: FoodRecall = {
    productDescription: 'Organic IQF Frozen Blueberries',
    reasonForRecall: 'Potential E. coli contamination',
    recallingFirm: 'Frutas y Hortalizas del Sur S.A.',
    recallDate: '20260722',
    classification: 'Class I',
    officialUrl: 'https://www.fda.gov/safety/recalls',
    summary: 'GreenWise Organic IQF Blueberries',
    source: 'FDA',
  };

  const results = rankAndFilterRecalls([recall], 'GreenWise Blueberries');
  assert.equal(results.length, 1);
  assert.equal(results[0].relevance, 'medium');
});