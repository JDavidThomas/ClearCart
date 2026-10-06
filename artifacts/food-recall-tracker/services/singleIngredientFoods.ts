export type SingleIngredientFoodCategory =
  | 'raw-meat'
  | 'raw-seafood'
  | 'produce'
  | 'pantry';

const FOOD_NAMES: Record<SingleIngredientFoodCategory, string[]> = {
  'raw-meat': [
    'beef',
    'ground beef',
    'steak',
    'ribeye steak',
    'sirloin steak',
    'tenderloin',
    'beef tenderloin',
    'flank steak',
    'skirt steak',
    'chuck roast',
    'ground turkey',
    'turkey breast',
    'turkey tenderloin',
    'ground chicken',
    'chicken breast',
    'chicken thigh',
    'chicken drumstick',
    'chicken wing',
    'chicken leg',
    'chicken tenderloin',
    'ground pork',
    'pork chop',
    'pork tenderloin',
    'pork loin',
    'pork shoulder',
    'pork belly',
    'ground lamb',
    'lamb chop',
    'veal',
    'ground veal',
  ],
  'raw-seafood': [
    'fish',
    'salmon',
    'tuna',
    'shrimp',
    'cod',
    'tilapia',
    'trout',
    'halibut',
    'haddock',
    'catfish',
    'pollock',
    'mahi mahi',
    'mackerel',
    'sardine',
    'anchovy',
    'crab',
    'lobster',
    'oyster',
    'clam',
    'scallop',
    'mussel',
    'prawn',
    'squid',
    'octopus',
    'calamari',
  ],
  produce: [
    'apple',
    'banana',
    'orange',
    'lemon',
    'lime',
    'pear',
    'peach',
    'nectarine',
    'plum',
    'grape',
    'strawberry',
    'blueberry',
    'raspberry',
    'blackberry',
    'cranberry',
    'cherry',
    'mango',
    'papaya',
    'pineapple',
    'kiwi',
    'avocado',
    'watermelon',
    'cantaloupe',
    'honeydew',
    'coconut',
    'fig',
    'date',
    'apricot',
    'pomegranate',
    'tomato',
    'potato',
    'sweet potato',
    'carrot',
    'celery',
    'cucumber',
    'zucchini',
    'yellow squash',
    'eggplant',
    'onion',
    'red onion',
    'green onion',
    'garlic',
    'lettuce',
    'spinach',
    'kale',
    'cabbage',
    'broccoli',
    'cauliflower',
    'asparagus',
    'green bean',
    'pea',
    'corn',
    'mushroom',
    'radish',
    'beet',
    'turnip',
    'parsnip',
    'arugula',
    'bok choy',
    'brussels sprout',
    'artichoke',
    'okra',
    'leek',
    'shallot',
    'bell pepper',
    'green bell pepper',
    'red bell pepper',
    'yellow bell pepper',
    'jalapeno',
    'basil',
    'parsley',
    'cilantro',
    'dill',
    'thyme',
    'rosemary',
    'mint',
  ],
  pantry: [
    'salt',
    'sea salt',
    'kosher salt',
    'sugar',
    'brown sugar',
    'white sugar',
    'granulated sugar',
    'cane sugar',
    'honey',
    'olive oil',
    'extra virgin olive oil',
    'vinegar',
    'apple cider vinegar',
    'balsamic vinegar',
    'white vinegar',
    'red wine vinegar',
    'distilled vinegar',
  ],
};

const LEADING_DESCRIPTORS = new Set([
  'raw',
  'fresh',
  'organic',
  'whole',
  'frozen',
  'uncooked',
  'unseasoned',
]);
const PREPARED_FOOD_MARKERS = new Set([
  'battered',
  'breaded',
  'burger',
  'casserole',
  'deli',
  'marinated',
  'meatball',
  'meatballs',
  'meatloaf',
  'nugget',
  'nuggets',
  'patty',
  'patties',
  'ready',
  'seasoned',
  'sausage',
  'sandwich',
  'smoothie',
  'soup',
  'tender',
  'tenders',
]);

function normalizeFoodName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function stripLeadingDescriptors(value: string) {
  const words = value.split(' ');
  while (words.length > 1 && LEADING_DESCRIPTORS.has(words[0])) words.shift();
  return words.join(' ');
}

function pluralForm(value: string) {
  if (value.endsWith('y') && !/[aeiou]y$/.test(value)) {
    return `${value.slice(0, -1)}ies`;
  }
  if (/(s|x|z|ch|sh)$/.test(value)) return `${value}es`;
  if (value.endsWith('o')) return `${value}s`;
  return `${value}s`;
}

const FOOD_BY_NAME = new Map<
  string,
  { category: SingleIngredientFoodCategory; canonicalName: string }
>();

for (const [category, names] of Object.entries(FOOD_NAMES) as [
  SingleIngredientFoodCategory,
  string[],
][]) {
  for (const name of names) {
    const canonicalName = normalizeFoodName(name);
    const aliases = new Set([canonicalName, pluralForm(canonicalName)]);
    if (canonicalName.endsWith('o')) {
      aliases.add(`${canonicalName}es`);
    }
    for (const alias of aliases) {
      FOOD_BY_NAME.set(alias, { category, canonicalName });
    }
  }
}

FOOD_BY_NAME.set('rib eye steak', {
  category: 'raw-meat',
  canonicalName: 'ribeye steak',
});

function resolveSingleIngredientFoodName(value: string) {
  return FOOD_BY_NAME.get(stripLeadingDescriptors(normalizeFoodName(value)));
}

export function getSingleIngredientFoodCategory(value: string): SingleIngredientFoodCategory | null {
  return resolveSingleIngredientFoodName(value)?.category ?? null;
}

export function isSingleIngredientFoodName(value: string) {
  return getSingleIngredientFoodCategory(value) !== null;
}

export function shouldLookupShoppingListProductByName(value: string) {
  return !isSingleIngredientFoodName(value);
}

export function areEquivalentSingleIngredientFoodNames(first: string, second: string) {
  if (containsPreparedFoodMarker(first) || containsPreparedFoodMarker(second)) return false;
  const firstFood = resolveSingleIngredientFoodName(first);
  const secondFood = resolveSingleIngredientFoodName(second);
  return Boolean(
    firstFood &&
      secondFood &&
      firstFood.category === secondFood.category &&
      firstFood.canonicalName === secondFood.canonicalName,
  );
}

export function containsPreparedFoodMarker(value: string) {
  return normalizeFoodName(value)
    .split(' ')
    .some((word) => PREPARED_FOOD_MARKERS.has(word));
}
