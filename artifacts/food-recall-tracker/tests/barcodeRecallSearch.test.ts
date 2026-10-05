import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBarcodeRecallExactSearchQueries,
} from '../services/recallSearch.ts';

process.env.EXPO_PUBLIC_OPENFDA_API_KEY = 'barcode-search-test-key';
const { searchFdaBarcodeRecalls } = await import('../services/fdaRecalls.ts');

const productName = 'Creamy Peanut Butter';
const brand = 'Great Value';
const barcode = '078742370033';
const exactQueries = buildBarcodeRecallExactSearchQueries(
  `${brand} ${productName}`,
  barcode,
);

function record(overrides: Record<string, string>) {
  return {
    recall_number: 'F-1234-2026',
    product_description: 'Great Value Creamy Peanut Butter, 16 oz',
    reason_for_recall: 'Potential allergen issue',
    recalling_firm: 'Example Foods',
    report_date: '20260722',
    classification: 'Class I',
    status: 'Ongoing',
    ...overrides,
  };
}

function mockOpenFda(
  resolveRecords: (search: string) => Record<string, string>[],
) {
  const searches: string[] = [];
  globalThis.fetch = async (input) => {
    const search = new URL(String(input)).searchParams.get('search') ?? '';
    searches.push(search);
    const body = JSON.stringify({ results: resolveRecords(search) });
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return searches;
}

test('an exact product-name recall is primary and skips all keyword fallbacks', async () => {
  const originalFetch = globalThis.fetch;
  const searches = mockOpenFda((search) =>
    search.includes('product_description:"Great Value Creamy Peanut Butter"')
      ? [record({})]
      : [],
  );

  try {
    const result = await searchFdaBarcodeRecalls(productName, barcode, { brand });

    assert.equal(result.exactRecalls.length, 1);
    assert.equal(result.exactRecalls[0].productDescription, 'Great Value Creamy Peanut Butter, 16 oz');
    assert.equal(result.relatedRecalls.length, 0);
    assert.equal(searches.length, exactQueries.length);
    assert.equal(
      searches.some((search) => search.includes('reason_for_recall:"peanut"')),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('peanut keyword results are only related when there is no active exact match', async () => {
  const originalFetch = globalThis.fetch;
  let exactStageRequestCountAtFallback = 0;
  const searches = mockOpenFda((search) => {
    const isFallback =
      search.includes('product_description:"peanut"') ||
      search.includes('reason_for_recall:"peanut"');
    if (isFallback) {
      exactStageRequestCountAtFallback = searches.filter((priorSearch) =>
        exactQueries.some((query) => priorSearch.includes(query)),
      ).length;
    }
    if (search.includes('product_description:"Great Value Creamy Peanut Butter"')) {
      return [record({ status: 'Terminated' })];
    }
    if (search.includes('product_description:"peanut"')) {
      return [
        record({
          recall_number: 'F-2001-2026',
          product_description: 'Peanut Butter Fudge Ice Cream',
          code_info: 'UPC 000000000000',
        }),
      ];
    }
    if (search.includes('reason_for_recall:"peanut"')) {
      return [
        record({
          recall_number: 'F-2002-2026',
          product_description: 'Kirkland Madeleines',
          reason_for_recall: 'May contain peanuts',
          code_info: 'UPC 000000000001',
        }),
        record({
          recall_number: 'F-2003-2026',
          product_description: 'Previously recalled peanut butter',
          status: 'Terminated',
        }),
      ];
    }
    return [];
  });

  try {
    const result = await searchFdaBarcodeRecalls(productName, barcode, { brand });

    assert.equal(exactStageRequestCountAtFallback, exactQueries.length);
    assert.equal(searches.length, exactQueries.length + 2);
    assert.equal(result.exactRecalls.length, 0);
    assert.deepEqual(
      result.relatedRecalls.map((recall) => recall.productDescription),
      ['Peanut Butter Fudge Ice Cream', 'Kirkland Madeleines'],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a barcode in FDA code information makes the record an exact match', async () => {
  const originalFetch = globalThis.fetch;
  const searches = mockOpenFda((search) =>
    search.includes('code_info:"0078742370033"')
      ? [
          record({
            product_description: 'Packaged product details',
            code_info: 'UPC 0078742370033',
          }),
        ]
      : [],
  );

  try {
    const result = await searchFdaBarcodeRecalls(productName, barcode, { brand });

    assert.equal(result.exactRecalls.length, 1);
    assert.equal(result.relatedRecalls.length, 0);
    assert.equal(
      searches.some((search) => search.includes('product_description:"peanut"')),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});