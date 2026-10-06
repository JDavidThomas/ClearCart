import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SHOPPING_LIST_CHECK_TTL_MS,
  buildShoppingListCheckResult,
  isShoppingListCheckStale,
  sortShoppingListItems,
  summarizeShoppingList,
  type ShoppingListCheckResult,
  type ShoppingListProfile,
  type ShoppingListItem,
} from '../services/shoppingListLogic.ts';

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

test('shopping list checks detect peanut products from the term without product data', () => {
  const result = buildShoppingListCheckResult('Great Value Peanut Butter', profile(), {
    recallResult: {
      recalls: [],
      recentNews: [],
      newsUnavailable: false,
      fdaUnavailable: false,
    },
    product: null,
  });

  assert.equal(result.allergenStatus, 'match');
  assert.deepEqual(result.allergenMatches, ['peanuts']);
  assert.equal(result.recallStatus, 'clear');
  assert.equal(result.healthStatus, 'not-configured');
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
});

test('shopping list sorts by recall, allergen, health, news, then clean urgency', () => {
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
    item('allergen', { ...baseResult, allergenStatus: 'match' }),
    item('possible-recall', { ...baseResult, recallStatus: 'possibly-related' }),
    item('recall', { ...baseResult, recallStatus: 'active' }),
  ];

  assert.deepEqual(
    sortShoppingListItems(rows).map((row) => row.id),
    ['recall', 'possible-recall', 'allergen', 'health', 'news', 'clean'],
  );
});

test('shopping list summary counts affected items instead of article totals', () => {
  const result: ShoppingListCheckResult = {
    recallStatus: 'active',
    recallCount: 3,
    allergenStatus: 'match',
    allergenMatches: ['peanuts'],
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

  assert.deepEqual(summarizeShoppingList([row]), {
    activeRecallItems: 1,
    possiblyRelatedRecallItems: 0,
    allergenMatchItems: 1,
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
