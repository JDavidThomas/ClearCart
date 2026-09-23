import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNutrition } from '../services/openFoodFacts.ts';
import {
  buildConflicts,
  nutritionSignals,
  shouldUseGenericLabelCheck,
} from '../services/nutritionInsights.ts';
import {
  glutenFreeCupcake,
  highSodiumSoup,
  highSugarCupcake,
  incompleteProduct,
} from './fixtures/nutritionProducts.ts';

test('high-sugar cupcake reports diabetes conflict with grams per 100g', () => {
  const conflicts = buildConflicts(highSugarCupcake, ['diabetes-type-2'], []);

  assert.deepEqual(conflicts, [
    {
      label: 'Diabetes',
      detail: 'Contains 28g sugar per 100g (high)',
    },
  ]);
});

test('high-sodium soup reports hypertension conflict with milligrams per 100g', () => {
  const conflicts = buildConflicts(highSodiumSoup, ['hypertension'], []);

  assert.deepEqual(conflicts, [
    {
      label: 'Hypertension',
      detail: 'Contains 820mg sodium per 100g (high)',
    },
  ]);
});

test('gluten-free cupcake does not report a celiac disease conflict', () => {
  const conflicts = buildConflicts(glutenFreeCupcake, ['celiac-disease'], []);

  assert.deepEqual(conflicts, []);
});

test('incomplete product signals the generic label-check fallback', () => {
  const signals = nutritionSignals(incompleteProduct, ['diabetes-type-2'], []);

  assert.equal(signals.hasComparableData, false);
  assert.equal(signals.hasMissingData, true);
  assert.equal(shouldUseGenericLabelCheck(incompleteProduct, false, signals), true);
});

test('Nutri-Score parsing accepts only grades A through E', () => {
  for (const grade of ['a', 'b', 'c', 'd', 'e']) {
    assert.equal(
      parseNutrition({ nutriments: { nutriscore_grade: grade } })?.nutriScoreGrade,
      grade,
    );
  }

  assert.equal(parseNutrition({ nutriments: { nutriscore_grade: 'f' } }), undefined);
  assert.equal(parseNutrition({ nutriscore_grade: 'not-a-grade', nutriments: { sugars_100g: 12 } })?.nutriScoreGrade, undefined);
});