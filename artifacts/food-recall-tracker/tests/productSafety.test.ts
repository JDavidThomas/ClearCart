import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyAllergenVerdict,
  evaluateAllergenMatches,
} from '../services/allergenMatching.ts';
import { buildOpenFoodFactsSearchStrategies } from '../services/openFoodFactsSearch.ts';
import { buildConflicts } from '../services/nutritionInsights.ts';

test('product-name fallback flags peanuts without Open Food Facts data', () => {
  const result = evaluateAllergenMatches(
    ['peanuts'],
    '',
    'Great Value Raw Peanuts',
    '',
  );

  assert.deepEqual(result.matches, ['peanuts']);
  assert.deepEqual(result.nameOnlyMatches, ['peanuts']);
  assert.equal(
    classifyAllergenVerdict({
      matches: result.matches,
      dataAvailable: false,
      hasProfile: true,
      severe: true,
    }),
    'severe-allergen-alert',
  );
});

test('allergen matching checks ingredient data even when the name does not match', () => {
  const result = evaluateAllergenMatches(
    ['peanuts'],
    '',
    'Chocolate Snack',
    'Contains peanuts',
  );

  assert.deepEqual(result.matches, ['peanuts']);
  assert.deepEqual(result.nameOnlyMatches, []);
});

test('allergen keyword matching respects word boundaries', () => {
  const result = evaluateAllergenMatches(['eggs'], '', 'Veggie Burger', '');
  assert.deepEqual(result.matches, []);
});

test('products with data and no profile match show a clean no-match verdict', () => {
  const result = evaluateAllergenMatches(['peanuts'], '', 'Chocolate Snack', 'Contains milk');
  assert.deepEqual(result.matches, []);
  assert.equal(
    classifyAllergenVerdict({
      matches: result.matches,
      dataAvailable: true,
      hasProfile: true,
      severe: true,
    }),
    'no-matching-allergens',
  );
});

test('same product name produces the same allergen verdict with or without database data', () => {
  const photo = evaluateAllergenMatches(['peanuts'], '', 'Great Value Raw Peanuts', '');
  const barcode = evaluateAllergenMatches(
    ['peanuts'],
    '',
    'Great Value Raw Peanuts',
    'Ingredients: peanuts',
  );
  assert.deepEqual(photo.matches, barcode.matches);
  assert.equal(
    classifyAllergenVerdict({
      matches: photo.matches,
      dataAvailable: false,
      hasProfile: true,
      severe: true,
    }),
    'severe-allergen-alert',
  );
  assert.equal(
    classifyAllergenVerdict({
      matches: barcode.matches,
      dataAvailable: true,
      hasProfile: true,
      severe: true,
    }),
    'severe-allergen-alert',
  );
});

test('Open Food Facts photo searches use exact, brand/type, then type strategies', () => {
  assert.deepEqual(
    buildOpenFoodFactsSearchStrategies('Great Value Raw Peanuts', 'Great Value', 'Peanuts'),
    [
      { strategy: 'exact-product-name', searchTerm: 'Great Value Raw Peanuts' },
      { strategy: 'brand-and-product-type', searchTerm: 'Great Value Peanuts' },
      { strategy: 'product-type', searchTerm: 'Peanuts' },
    ],
  );
});

test('health name fallbacks flag diabetes, hypertension, and celiac risk without product data', () => {
  assert.deepEqual(
    buildConflicts(null, ['diabetes-type-2'], [], 'Chocolate Cake'),
    [
      {
        label: 'Diabetes',
        detail: 'Product name suggests a likely high-sugar item. Check the nutrition label.',
        source: 'product-name',
      },
    ],
  );
  assert.deepEqual(
    buildConflicts(null, ['hypertension'], [], 'Salted Pretzels'),
    [
      {
        label: 'Hypertension',
        detail: 'Product name suggests a likely high-sodium item. Check the nutrition label.',
        source: 'product-name',
      },
    ],
  );
  assert.deepEqual(
    buildConflicts(null, ['celiac-disease'], [], 'Wheat Bread'),
    [
      {
        label: 'Celiac Disease',
        detail: 'Product name suggests a likely gluten-containing item. Check the ingredient label.',
        source: 'product-name',
      },
    ],
  );
});

test('health name fallback keeps the same result when nutrition data is present', () => {
  const result = buildConflicts(
    { barcode: 'test', name: 'Chocolate Cake', brand: 'Bakery', nutrition: { sugars100g: 2 } },
    ['diabetes-type-2'],
    [],
    'Chocolate Cake',
  );

  assert.deepEqual(result, [
    {
      label: 'Diabetes',
      detail: 'Product name suggests a likely high-sugar item. Check the nutrition label.',
      source: 'product-name',
    },
  ]);
});