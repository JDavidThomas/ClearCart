import assert from 'node:assert/strict';
import test from 'node:test';

process.env.EXPO_PUBLIC_OPENFDA_API_KEY = 'phrase-search-test-key';
const [{ searchFdaRecalls }, { getRecallRelevanceNotice, splitRecallGroups }] = await Promise.all([
  import('../services/fdaRecalls.ts'),
  import('../services/recallRelevance.ts'),
]);

function recallRecord(productDescription: string, recallNumber: string) {
  return {
    recall_number: recallNumber,
    product_description: productDescription,
    reason_for_recall: 'Potential contamination',
    recalling_firm: 'Example Foods',
    report_date: '20261001',
    classification: 'Class I',
    status: 'Ongoing',
    url: 'https://www.fda.gov/safety/recalls',
  };
}

function mockOpenFda(resolveRecords: (search: string) => ReturnType<typeof recallRecord>[]) {
  const searches: string[] = [];
  const requestUrls: string[] = [];
  globalThis.fetch = async (input) => {
    const requestUrl = String(input);
    const search = new URL(requestUrl).searchParams.get('search') ?? '';
    searches.push(search);
    requestUrls.push(requestUrl);
    return new Response(JSON.stringify({ results: resolveRecords(search) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { searches, requestUrls };
}

test('ground beef returns only product descriptions containing the exact phrase', async () => {
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const exactRequestLogs: unknown[][] = [];
  console.info = (...args) => {
    if (args[0] === '[OpenFDA] exact FDA request URL') exactRequestLogs.push(args);
  };
  const { searches, requestUrls } = mockOpenFda((search) =>
    search.includes('product_description:"ground beef"')
      ? [
          recallRecord('Ground Beef Patties', 'F-1001-2026'),
          recallRecord('Roast Beef Sandwiches', 'F-1002-2026'),
          recallRecord('Beef Jerky', 'F-1003-2026'),
        ]
      : [],
  );

  try {
    const recalls = await searchFdaRecalls('ground beef');
    assert.deepEqual(recalls.map((recall) => recall.productDescription), ['Ground Beef Patties']);
    assert.equal(searches.length, 1);
    assert.equal(recalls[0]?.searchMatch, undefined);
    assert.equal(
      requestUrls[0]?.includes('search=product_description%3A%22ground+beef%22+AND+report_date%3A'),
      true,
    );
    assert.equal(requestUrls[0]?.includes(' OR '), false);
    const loggedRequest = exactRequestLogs[0]?.[1] as
      | { search?: string; url?: string }
      | undefined;
    assert.equal(loggedRequest?.search?.startsWith('product_description:"ground beef" AND report_date:['), true);
    assert.equal(
      loggedRequest?.url?.includes('search=product_description%3A%22ground+beef%22+AND+report_date%3A'),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
  }
});

test('roast beef and peanut butter use their complete phrases', async () => {
  const originalFetch = globalThis.fetch;

  try {
    for (const [term, matchingDescription, otherDescription] of [
      ['roast beef', 'Roast Beef Sandwiches', 'Ground Beef Patties'],
      ['peanut butter', 'Peanut Butter Spread', 'Peanut Protein Bars'],
    ]) {
      const { searches, requestUrls } = mockOpenFda((search) =>
        search.includes(`product_description:"${term}"`)
          ? [
              recallRecord(matchingDescription, 'F-2001-2026'),
              recallRecord(otherDescription, 'F-2002-2026'),
            ]
          : [],
      );
      const recalls = await searchFdaRecalls(term);

      assert.deepEqual(recalls.map((recall) => recall.productDescription), [matchingDescription]);
      assert.equal(searches.length, 1);
      assert.equal(
        requestUrls[0]?.includes(
          `search=product_description%3A%22${term.replace(' ', '+')}%22+AND+report_date%3A`,
        ),
        true,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('single-word beef and greenwise searches retain broad matching', async () => {
  const originalFetch = globalThis.fetch;

  try {
    const broadBeefDescriptions = [
      'Ground Beef Patties',
      'Roast Beef Sandwiches',
      'Beef Jerky',
    ];
    const { searches, requestUrls } = mockOpenFda((search) =>
      search.includes('product_description:"beef"')
        ? broadBeefDescriptions.map((description, index) =>
            recallRecord(description, `F-300${index + 1}-2026`),
          )
        : [],
    );
    const beefRecalls = await searchFdaRecalls('beef');
    assert.deepEqual(
      beefRecalls.map((recall) => recall.productDescription).sort(),
      [...broadBeefDescriptions].sort(),
    );
    assert.equal(searches.length, 1);
    assert.equal(
      requestUrls[0]?.includes('search=product_description%3A%22beef%22+AND+report_date%3A'),
      true,
    );

    const { searches: greenwiseSearches } = mockOpenFda((search) =>
      search.includes('product_description:"greenwise"')
        ? [recallRecord('GreenWise Organic Blueberries', 'F-4001-2026')]
        : [],
    );
    const greenwiseRecalls = await searchFdaRecalls('greenwise');
    assert.equal(greenwiseRecalls[0]?.productDescription, 'GreenWise Organic Blueberries');
    assert.equal(greenwiseSearches.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('word fallback runs only after an empty phrase search and is labeled possibly related', async () => {
  const originalFetch = globalThis.fetch;
  const { searches, requestUrls } = mockOpenFda((search) =>
    search.includes('product_description:"ground beef"')
      ? []
      : search.includes('product_description:"ground" OR product_description:"beef"')
        ? [
            recallRecord(
              'Tomato Salsa Fresca with Ground Cumin',
              'F-5001-2026',
            ),
            recallRecord('Ghirardelli Sweet Ground Chocolate Powder', 'F-5002-2026'),
            recallRecord('Ground Peppermint Leaf Powder', 'F-5003-2026'),
            recallRecord('Ground Allspice', 'F-5004-2026'),
            recallRecord('Roast Beef Sandwiches', 'F-5005-2026'),
          ]
        : [],
  );

  try {
    const recalls = await searchFdaRecalls('ground beef');

    assert.equal(searches.length, 2);
    assert.equal(searches[0]?.includes('product_description:"ground beef"'), true);
    assert.equal(
      searches[1]?.includes('product_description:"ground" OR product_description:"beef"'),
      true,
    );
    assert.equal(
      requestUrls[1]?.includes(
        'search=%28product_description%3A%22ground%22+OR+product_description%3A%22beef%22%29+AND+report_date%3A',
      ),
      true,
    );
    assert.equal(recalls[0]?.searchMatch, 'word-fallback');
    assert.equal(recalls[0]?.relevance, 'low');
    const groups = splitRecallGroups('ground beef', recalls);
    assert.equal(groups.directRecalls.length, 0);
    assert.deepEqual(
      groups.relatedRecalls.map((recall) => recall.productDescription).sort(),
      [
        'Ghirardelli Sweet Ground Chocolate Powder',
        'Ground Allspice',
        'Ground Peppermint Leaf Powder',
        'Roast Beef Sandwiches',
        'Tomato Salsa Fresca with Ground Cumin',
      ].sort(),
    );
    assert.equal(
      /may not be the same product/i.test(
        getRecallRelevanceNotice('ground beef', recalls) ?? '',
      ),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
