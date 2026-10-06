import assert from 'node:assert/strict';
import test from 'node:test';
import type { FoodRecall } from '../types/recall.ts';
import { rankAndFilterRecalls } from '../services/recallRelevance.ts';
import {
  buildBarcodeRecallExactSearchQueries,
  buildBarcodeRecallFallbackSearchQueries,
  buildOpenFdaFieldSearchQueries,
  buildOpenFdaSearchQuery,
  buildRecallWordFallbackSearchQuery,
  buildRecallSearchStrategies,
  isRecallDescriptionPhraseMatch,
  isExactBarcodeRecallMatch,
} from '../services/recallSearch.ts';

test('multi-word recall searches start with only the complete product-description phrase', () => {
  const strategies = buildRecallSearchStrategies('Great Value Frozen Berries');

  assert.deepEqual(
    strategies.map((strategy) => strategy.query),
    ['product_description:"Great Value Frozen Berries"'],
  );
});

test('single-word recall searches keep the broad product and firm search strategies', () => {
  assert.deepEqual(
    buildRecallSearchStrategies('beef').map((strategy) => strategy.query),
    ['product_description:"beef"', 'recalling_firm:beef'],
  );
  assert.equal(buildRecallSearchStrategies('greenwise')[0]?.query, 'product_description:"greenwise"');
});

test('multi-word fallback searches OR individual product-description words', () => {
  assert.equal(
    buildRecallWordFallbackSearchQuery('ground beef'),
    'product_description:"ground" OR product_description:"beef"',
  );
  assert.equal(buildRecallWordFallbackSearchQuery('beef'), '');
});

test('phrase matching requires adjacent words in the product description', () => {
  assert.equal(isRecallDescriptionPhraseMatch('Ground Beef, 80% lean', 'ground beef'), true);
  assert.equal(isRecallDescriptionPhraseMatch('Roast Beef Sandwiches', 'ground beef'), false);
  assert.equal(isRecallDescriptionPhraseMatch('Beef Jerky', 'ground beef'), false);
});

test('a firm phrase produces only one query instead of duplicate fallbacks', () => {
  assert.deepEqual(buildOpenFdaFieldSearchQueries('recalling_firm', 'Midwest Poultry'), [
    'recalling_firm:"Midwest Poultry"',
  ]);
});

test('OpenFDA query builder avoids duplicate OR strategies', () => {
  assert.deepEqual(
    buildOpenFdaFieldSearchQueries('product_description', 'guacamole'),
    ['product_description:"guacamole"'],
  );
  assert.equal(buildOpenFdaSearchQuery('guacamole'), 'product_description:"guacamole"');
  assert.equal(buildRecallSearchStrategies('avocado').length, 2);
  assert.equal(buildOpenFdaSearchQuery('xyzabc'), 'product_description:"xyzabc"');
  const encodedPhraseSearch = new URLSearchParams({
    search: buildOpenFdaSearchQuery('ground beef'),
  }).toString();
  assert.equal(
    encodedPhraseSearch,
    'search=product_description%3A%22ground+beef%22',
  );
});

test('egg, produce, and meat-product terms all build FDA recall queries', () => {
  for (const term of ['eggs', 'banana', 'Fontanini Pork Sausage Links']) {
    assert.equal(buildOpenFdaSearchQuery(term).startsWith('product_description:'), true);
  }
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

test('barcode exact searches include full product identity and UPC/EAN variants', () => {
  assert.deepEqual(
    buildBarcodeRecallExactSearchQueries(
      'Great Value Creamy Peanut Butter',
      '078742370033',
    ),
    [
      'product_description:"Great Value Creamy Peanut Butter"',
      'code_info:"078742370033"',
      'product_description:"078742370033"',
      'code_info:"0078742370033"',
      'product_description:"0078742370033"',
    ],
  );
});

test('barcode fallback searches target product keywords and recall reasons', () => {
  assert.deepEqual(
    buildBarcodeRecallFallbackSearchQueries(
      'Great Value Creamy Peanut Butter',
      'Great Value',
    ),
    ['product_description:"peanut"', 'reason_for_recall:"peanut"'],
  );
});

test('barcode exact matching rejects other peanut products unless their UPC matches', () => {
  const unrelatedRecall: FoodRecall = {
    productDescription: 'Peanut Butter Fudge Ice Cream',
    reasonForRecall: 'Potential allergen issue',
    recallingFirm: 'Example Creamery',
    recallDate: '20260722',
    classification: 'Class I',
    officialUrl: 'https://www.fda.gov/safety/recalls',
    codeInfo: 'UPC 000000000000',
  };
  const exactByUpc = { ...unrelatedRecall, codeInfo: 'UPC 0078742370033' };
  const exactByName = {
    ...unrelatedRecall,
    productDescription: 'Great Value Creamy Peanut Butter, 16 oz',
  };

  assert.equal(
    isExactBarcodeRecallMatch(
      unrelatedRecall,
      'Great Value Creamy Peanut Butter',
      '078742370033',
    ),
    false,
  );
  assert.equal(
    isExactBarcodeRecallMatch(
      exactByUpc,
      'Great Value Creamy Peanut Butter',
      '078742370033',
    ),
    true,
  );
  assert.equal(
    isExactBarcodeRecallMatch(
      exactByName,
      'Great Value Creamy Peanut Butter',
      '078742370033',
    ),
    true,
  );
});