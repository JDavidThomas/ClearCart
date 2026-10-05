import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOpenFoodFactsBarcodeUrl,
  getOpenFoodFactsBarcodeCacheKeys,
  parseOpenFoodFactsBarcodeResponse,
} from '../services/openFoodFacts.ts';

function assertThrowsWithMessage(action: () => unknown, expected: RegExp) {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }

  if (!(thrown instanceof Error) || !expected.test(thrown.message)) {
    throw new Error(
      `Expected an error matching ${expected}; received ${
        thrown instanceof Error ? thrown.message : String(thrown)
      }.`,
    );
  }
}

test('builds the Open Food Facts product URL with the scanned barcode', () => {
  assert.equal(
    buildOpenFoodFactsBarcodeUrl('072486005220'),
    'https://world.openfoodfacts.org/api/v2/product/072486005220.json',
  );
});

test('barcode cache clearing is scoped to barcode results, not name searches or auth data', () => {
  assert.deepEqual(
    getOpenFoodFactsBarcodeCacheKeys([
      '@food-recall-tracker/open-food-facts/barcode/072486005220',
      '@food-recall-tracker/open-food-facts/name/corn-muffin-mix',
      '@supabase.auth.token',
    ]),
    ['@food-recall-tracker/open-food-facts/barcode/072486005220'],
  );
});

test('treats Open Food Facts 404 product-not-found JSON as a not-found result', () => {
  const body = JSON.stringify({
    status: 0,
    status_verbose: 'product not found',
    code: '0072486005220',
  });

  assert.equal(parseOpenFoodFactsBarcodeResponse(404, body, '072486005220'), null);
});

test('parses a successful Open Food Facts barcode response', () => {
  const body = JSON.stringify({
    status: 1,
    product: {
      code: '072486005220',
      product_name: 'Hot Honey Corn Muffin Mix',
      brands: 'Example Brand',
      ingredients_text: 'Corn meal, honey, spices',
    },
  });

  assert.deepEqual(
    parseOpenFoodFactsBarcodeResponse(200, body, '072486005220'),
    {
      barcode: '072486005220',
      name: 'Hot Honey Corn Muffin Mix',
      brand: 'Example Brand',
      ingredients: 'Corn meal, honey, spices',
      allergens: undefined,
      nutrition: undefined,
    },
  );
});

test('keeps non-404 HTTP failures distinct from a missing product', () => {
  assertThrowsWithMessage(
    () => parseOpenFoodFactsBarcodeResponse(
      503,
      JSON.stringify({ status: 0, status_verbose: 'service unavailable' }),
      '072486005220',
    ),
    /unavailable/,
  );
});

test('reports malformed Open Food Facts response JSON', () => {
  assertThrowsWithMessage(
    () => parseOpenFoodFactsBarcodeResponse(200, '<html>not JSON</html>', '072486005220'),
    /invalid JSON/,
  );
});