import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SHOPPING_LIST_CHECK_TTL_MS,
  SHOPPING_LIST_CHECK_VERSION,
  buildShoppingListCheckResult,
  getShoppingListAllergenLabel,
  isShoppingListCheckStale,
  sortShoppingListItems,
  summarizeShoppingList,
  type ShoppingListCheckResult,
  type ShoppingListProfile,
  type ShoppingListItem,
} from '../services/shoppingListLogic.ts';
import {
  getSingleIngredientFoodCategory,
  isSingleIngredientFoodName,
  shouldLookupShoppingListProductByName,
} from '../services/singleIngredientFoods.ts';

const profile = (updates: Partial<ShoppingListProfile> = {}) =>
  ({
    allergies: ['peanuts'],
    customAllergy: '',
    severity: 'moderate',
    healthConditions: [],
    dietaryPreferences: [],
    healthConsentGiven: false,
    ...updates,
  }) as ShoppingListProfile;

test('name-only peanut matches are presented as possible, not confirmed', () => {
  const result = buildShoppingListCheckResult('Great Value Peanut Butter', profile(), {
    recallResult: {
      recalls: [],
      recentNews: [],
      newsUnavailable: false,
      fdaUnavailable: false,
    },
    product: null,
  });

  assert.equal(result.allergenStatus, 'possible-match');
  assert.equal(result.allergenEvidence, 'product-name');
  assert.deepEqual(result.allergenMatches, ['peanuts']);
  assert.equal(
    getShoppingListAllergenLabel(result),
    'Possible allergen match based on product name: Peanuts. Verify the package label — this is not a confirmed match.',
  );
  assert.equal(result.recallStatus, 'clear');
  assert.equal(result.healthStatus, 'not-configured');
});

test('normalized raw beef and turkey names do not match eggs or gluten by name', () => {
  const allergies = profile({ allergies: ['eggs', 'gluten'] });
  for (const term of ['  GROUND BEEF  ', 'Ground Turkey']) {
    const result = buildShoppingListCheckResult(term, allergies, {
      recallResult: {
        recalls: [],
        recentNews: [],
        newsUnavailable: false,
        fdaUnavailable: false,
      },
      product: null,
    });

    assert.equal(result.allergenStatus, 'unavailable');
    assert.deepEqual(result.allergenMatches, []);
    assert.equal(
      getShoppingListAllergenLabel(result),
      'Ingredient data not available — verify the package label.',
    );
  }
  assert.equal(getSingleIngredientFoodCategory('  GROUND BEEF  '), 'raw-meat');
  assert.equal(getSingleIngredientFoodCategory('Ground Turkey'), 'raw-meat');
  assert.equal(getSingleIngredientFoodCategory('Fresh Salmon'), 'raw-seafood');
  assert.equal(getSingleIngredientFoodCategory('Green Bell Pepper'), 'produce');
  assert.equal(getSingleIngredientFoodCategory('Olive Oil'), 'pantry');
  assert.equal(isSingleIngredientFoodName('Ground Beef Burger Patty'), false);
  assert.equal(shouldLookupShoppingListProductByName('Ground Beef'), false);
  assert.equal(shouldLookupShoppingListProductByName('Banana'), false);
  assert.equal(shouldLookupShoppingListProductByName('Ground Beef Burger Patty'), true);
});

test('burger patties and breaded chicken tenders produce possible gluten matches', () => {
  for (const term of ['Ground Beef Burger Patty', 'Breaded Chicken Tenders']) {
    const result = buildShoppingListCheckResult(
      term,
      profile({ allergies: ['gluten'] }),
      { product: null },
    );

    assert.equal(result.allergenStatus, 'possible-match');
    assert.deepEqual(result.allergenMatches, ['gluten']);
    assert.equal(result.allergenEvidence, 'product-name');
    assert.equal(
      getShoppingListAllergenLabel(result).includes(
        'Possible allergen match based on product name: Gluten',
      ),
      true,
    );
  }
});

test('banana without trusted ingredient data asks the user to check the package', () => {
  const result = buildShoppingListCheckResult(
    'Banana',
    profile({ allergies: ['eggs', 'gluten'] }),
    { product: null },
  );

  assert.equal(result.allergenStatus, 'unavailable');
  assert.deepEqual(result.allergenMatches, []);
  assert.equal(
    getShoppingListAllergenLabel(result),
    'Ingredient data not available — verify the package label.',
  );
  assert.equal(isSingleIngredientFoodName('Banana'), true);
});

test('ingredient-data allergen matches keep the confirmed label', () => {
  const result = buildShoppingListCheckResult('Peanut Butter', profile(), {
    product: {
      barcode: '000000000001',
      brand: 'Example',
      name: 'Peanut Butter',
      ingredients: 'Roasted peanuts',
      allergens: 'peanuts',
    },
  });

  assert.equal(result.allergenStatus, 'match');
  assert.equal(result.allergenEvidence, 'ingredient-data');
  assert.deepEqual(result.allergenMatches, ['peanuts']);
  assert.equal(getShoppingListAllergenLabel(result), 'Contains your allergens: Peanuts');
  assert.equal(
    getShoppingListAllergenLabel(result, 'Jordan'),
    'Jordan — Contains your allergens: Peanuts',
  );
});

test('raw beef ignores generic nutrition estimates and unrelated prepared-product data', () => {
  const healthProfile = profile({
    allergies: ['eggs', 'gluten'],
    healthConditions: ['hypertension', 'high-cholesterol'],
    dietaryPreferences: ['low-sodium'],
    healthConsentGiven: true,
  });
  const genericNutritionResult = buildShoppingListCheckResult('Ground Beef', healthProfile, {
    product: {
      barcode: '000000000002',
      brand: 'Search result',
      name: 'Ground Beef',
      ingredients: '',
      allergens: '',
      nutrition: { sodium100g: 700, saturatedFat100g: 9 },
    },
  });
  const mismatchedPreparedProductResult = buildShoppingListCheckResult(
    'Ground Beef',
    healthProfile,
    {
      product: {
        barcode: '000000000003',
        brand: 'Search result',
        name: 'Ground Beef Meatballs',
        ingredients: 'beef, egg, wheat breadcrumbs',
        allergens: 'eggs, wheat',
        nutrition: { sodium100g: 700, saturatedFat100g: 9 },
      },
    },
  );

  assert.deepEqual(genericNutritionResult.healthConflicts, []);
  assert.equal(genericNutritionResult.healthStatus, 'unavailable');
  assert.equal(genericNutritionResult.allergenStatus, 'unavailable');
  assert.deepEqual(mismatchedPreparedProductResult.allergenMatches, []);
  assert.equal(mismatchedPreparedProductResult.allergenStatus, 'unavailable');
  assert.deepEqual(mismatchedPreparedProductResult.healthConflicts, []);
});

test('shopping list checks treat a banana as clean when product data is available', () => {
  const result = buildShoppingListCheckResult('banana', profile(), {
    recallResult: {
      recalls: [],
      recentNews: [],
      newsUnavailable: false,
      fdaUnavailable: false,
    },
    product: {
      barcode: '000000000000',
      brand: 'Fresh',
      name: 'Banana',
      ingredients: 'banana',
      allergens: '',
      nutrition: { carbohydrates100g: 22 },
    },
  });

  assert.equal(result.allergenStatus, 'clear');
  assert.equal(result.recallStatus, 'clear');
});

test('word-fallback recalls are shown as possibly related rather than active', () => {
  const result = buildShoppingListCheckResult('ground beef', profile(), {
    recallResult: {
      recalls: [
        {
          productDescription: 'Beef Jerky',
          reasonForRecall: 'Potential contamination',
          recallingFirm: 'Example Foods',
          recallDate: '20261001',
          classification: 'Class I',
          officialUrl: 'https://www.fda.gov/safety/recalls',
          searchMatch: 'word-fallback',
        },
      ],
      recentNews: [],
      newsUnavailable: false,
      fdaUnavailable: false,
    },
    product: null,
  });

  assert.equal(result.recallStatus, 'possibly-related');
  assert.equal(result.recallCount, 1);
});

test('unavailable services remain distinct from clean results and preserve news', () => {
  const result = buildShoppingListCheckResult('Nevada Graziers Raw Milk Cheeses', profile(), {
    recallResult: {
      recalls: [],
      recentNews: [
        {
          title: 'Cheese recall update',
          url: 'https://example.com/recall',
          publishedAt: '2026-10-04T12:00:00.000Z',
          source: 'Example News',
        },
      ],
      newsUnavailable: false,
      fdaUnavailable: true,
    },
    product: null,
    productLookupFailed: true,
  });

  assert.equal(result.recallStatus, 'unavailable');
  assert.equal(result.allergenStatus, 'unavailable');
  assert.equal(result.newsArticleCount, 1);
  assert.equal(result.newsArticles[0]?.title, 'Cheese recall update');
});

test('shopping list checks use profile health conditions and show name-based conflicts', () => {
  const result = buildShoppingListCheckResult(
    'Chocolate Cake',
    profile({
      healthConditions: ['diabetes-type-2'],
      healthConsentGiven: true,
    }),
    {
      recallResult: {
        recalls: [],
        recentNews: [],
        newsUnavailable: false,
        fdaUnavailable: false,
      },
      product: null,
    },
  );

  assert.equal(result.healthStatus, 'conflicts');
  assert.equal(result.healthConflicts[0]?.label, 'Diabetes');
});

test('shopping list checks become stale at one hour and when never checked', () => {
  const now = Date.parse('2026-10-05T12:00:00.000Z');
  assert.equal(isShoppingListCheckStale(null, now), true);
  assert.equal(
    isShoppingListCheckStale(
      new Date(now - SHOPPING_LIST_CHECK_TTL_MS + 1).toISOString(),
      now,
    ),
    false,
  );
  assert.equal(
    isShoppingListCheckStale(
      new Date(now - SHOPPING_LIST_CHECK_TTL_MS).toISOString(),
      now,
    ),
    true,
  );
  const recentCheck = new Date(now - 1_000).toISOString();
  assert.equal(
    isShoppingListCheckStale(recentCheck, now, SHOPPING_LIST_CHECK_VERSION - 1),
    true,
  );
  assert.equal(
    isShoppingListCheckStale(recentCheck, now, SHOPPING_LIST_CHECK_VERSION),
    false,
  );
});

test('shopping list sorts confirmed alerts ahead of possible matches and clean items', () => {
  const baseResult: ShoppingListCheckResult = {
    recallStatus: 'clear',
    recallCount: 0,
    allergenStatus: 'clear',
    allergenMatches: [],
    healthStatus: 'clear',
    healthConflicts: [],
    newsArticleCount: 0,
    newsArticles: [],
    newsUnavailable: false,
  };
  const item = (
    id: string,
    result: ShoppingListItem['last_check_result'],
  ): ShoppingListItem => ({
    id,
    user_id: 'user',
    term: id,
    added_at: '2026-10-05T10:00:00.000Z',
    last_checked_at: '2026-10-05T10:00:00.000Z',
    last_check_result: result,
    is_checked: false,
  });
  const rows = [
    item('clean', baseResult),
    item('news', { ...baseResult, newsArticleCount: 1 }),
    item('health', { ...baseResult, healthStatus: 'conflicts' }),
    item('allergen', {
      ...baseResult,
      allergenStatus: 'match',
      allergenEvidence: 'ingredient-data',
    }),
    item('possible-recall', { ...baseResult, recallStatus: 'possibly-related' }),
    item('possible-allergen', { ...baseResult, allergenStatus: 'possible-match' }),
    item('recall', { ...baseResult, recallStatus: 'active' }),
  ];

  assert.deepEqual(
    sortShoppingListItems(rows).map((row) => row.id),
    ['recall', 'possible-recall', 'allergen', 'health', 'possible-allergen', 'news', 'clean'],
  );
});

test('shopping list summary counts affected items instead of article totals', () => {
  const result: ShoppingListCheckResult = {
    recallStatus: 'active',
    recallCount: 3,
    allergenStatus: 'match',
    allergenMatches: ['peanuts'],
    allergenEvidence: 'ingredient-data',
    healthStatus: 'conflicts',
    healthConflicts: [],
    newsArticleCount: 4,
    newsArticles: [],
    newsUnavailable: false,
  };
  const row = {
    id: 'item',
    user_id: 'user',
    term: 'Food',
    added_at: '2026-10-05T10:00:00.000Z',
    last_checked_at: '2026-10-05T10:00:00.000Z',
    last_check_result: result,
    is_checked: false,
  };
  const possibleMatchRow: ShoppingListItem = {
    ...row,
    id: 'possible-match',
    last_check_result: {
      ...result,
      recallStatus: 'clear',
      recallCount: 0,
      allergenStatus: 'possible-match',
      allergenMatches: ['gluten'],
      allergenEvidence: 'product-name',
      healthStatus: 'clear',
      healthConflicts: [],
      newsArticleCount: 0,
    },
  };

  assert.deepEqual(summarizeShoppingList([row, possibleMatchRow]), {
    activeRecallItems: 1,
    possiblyRelatedRecallItems: 0,
    allergenMatchItems: 1,
    possibleAllergenItems: 1,
    healthConflictItems: 1,
    newsItems: 1,
  });
});

test('completed shopping list items sort below active items', () => {
  const result: ShoppingListCheckResult = {
    recallStatus: 'active',
    recallCount: 1,
    allergenStatus: 'match',
    allergenMatches: ['peanuts'],
    healthStatus: 'conflicts',
    healthConflicts: [],
    newsArticleCount: 3,
    newsArticles: [],
    newsUnavailable: false,
  };
  const row = (id: string, isChecked: boolean): ShoppingListItem => ({
    id,
    user_id: 'user',
    term: id,
    added_at: '2026-10-05T10:00:00.000Z',
    last_checked_at: '2026-10-05T10:00:00.000Z',
    last_check_result: result,
    is_checked: isChecked,
  });

  assert.deepEqual(
    sortShoppingListItems([row('completed', true), row('active', false)]).map(
      (item) => item.id,
    ),
    ['active', 'completed'],
  );
});
