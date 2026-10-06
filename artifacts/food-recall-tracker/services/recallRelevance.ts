import type { FoodRecall, ProduceRecallGroup, RecallRelevance } from '../types/recall.ts';
import { cleanRecallSearchTerm } from './recallSearch.ts';

const COMMON_PRODUCE_TERMS = [
  'apple',
  'avocado',
  'asparagus',
  'banana',
  'blueberry',
  'broccoli',
  'cabbage',
  'cantaloupe',
  'carrot',
  'celery',
  'cauliflower',
  'cherry',
  'corn',
  'cucumber',
  'eggplant',
  'garlic',
  'grape',
  'ginger',
  'honeydew',
  'kale',
  'kiwi',
  'lemon',
  'lettuce',
  'lime',
  'mango',
  'mushroom',
  'onion',
  'orange',
  'peach',
  'pear',
  'pepper',
  'pineapple',
  'plum',
  'potato',
  'raspberry',
  'spinach',
  'strawberry',
  'sweet potato',
  'tomato',
] as const;

const NON_FOOD_PRODUCT_WORDS = new Set([
  'aquarium',
  'cat',
  'cleaner',
  'cosmetic',
  'dog',
  'disinfectant',
  'gel',
  'lotion',
  'medicine',
  'pet',
  'shampoo',
  'sanitizer',
  'sanitizing',
  'soap',
  'spray',
  'spf',
  'sunscreen',
  'wipe',
  'wipes',
]);

const DIRECT_PRODUCE_WORDS = new Set([
  'bag',
  'bagged',
  'bunch',
  'bunches',
  'chopped',
  'count',
  'cut',
  'diced',
  'each',
  'fresh',
  'frozen',
  'fruit',
  'organic',
  'pack',
  'packaged',
  'peeled',
  'piece',
  'pieces',
  'produce',
  'ready',
  'sliced',
  'slices',
  'stem',
  'stems',
  'to',
  'vegetable',
  'whole',
]);

function wordsFrom(value: string) {
  return cleanRecallSearchTerm(value).toLowerCase().split(' ').filter(Boolean);
}

function singularize(word: string) {
  if (word.endsWith('ies') && word.length > 3) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes') && word.length > 3) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 2) return word.slice(0, -1);
  return word;
}

function wordsMatch(left: string, right: string) {
  return left === right || singularize(left) === singularize(right);
}

function getProduceItemFromWords(words: string[]) {
  return (
    COMMON_PRODUCE_TERMS.find((produceItem) => {
      const produceWords = wordsFrom(produceItem);
      if (produceWords.length !== words.length) return false;
      return produceWords.every((produceWord, index) => wordsMatch(produceWord, words[index]));
    }) ?? null
  );
}

function sequenceStartsAt(descriptionWords: string[], termWords: string[], startIndex: number) {
  return termWords.every((termWord, offset) => {
    const descriptionWord = descriptionWords[startIndex + offset];
    return Boolean(descriptionWord) && wordsMatch(descriptionWord, termWord);
  });
}

function firstTermIndex(descriptionWords: string[], termWords: string[]) {
  for (let index = 0; index < descriptionWords.length; index += 1) {
    if (sequenceStartsAt(descriptionWords, termWords, index)) return index;
  }
  return -1;
}

function hasObviousProduceMismatch(termWords: string[], descriptionWords: string[]) {
  if (!getProduceItemFromWords(termWords)) {
    return false;
  }

  return descriptionWords.some((word) => NON_FOOD_PRODUCT_WORDS.has(word));
}

function hasKnownBrandMismatch(termWords: string[], descriptionWords: string[]) {
  if (termWords.length !== 1 || termWords[0] !== 'chicken') return false;

  const chickenOfTheSeaIndex = descriptionWords.findIndex(
    (word, index) =>
      word === 'chicken' &&
      descriptionWords[index + 1] === 'of' &&
      descriptionWords[index + 2] === 'the' &&
      descriptionWords[index + 3] === 'sea',
  );

  return chickenOfTheSeaIndex >= 0;
}

export function getProduceItem(term: string) {
  return getProduceItemFromWords(wordsFrom(term));
}

function isDirectProduceDescription(description: string, produceItem: string) {
  const descriptionWords = wordsFrom(description);
  const produceWords = wordsFrom(produceItem);
  const produceIndex = descriptionWords.findIndex((_, index) =>
    sequenceStartsAt(descriptionWords, produceWords, index),
  );
  if (produceIndex < 0) return false;

  const wordsAfterProduce = descriptionWords.slice(produceIndex + produceWords.length);
  return wordsAfterProduce.every(
    (word) =>
      DIRECT_PRODUCE_WORDS.has(word) ||
      wordsMatch(word, produceWords[produceWords.length - 1]) ||
      /^\d+(?:\.\d+)?$/.test(word) ||
      /^(?:oz|lb|lbs|kg|g|gram|grams|ounce|ounces|pound|pounds)$/.test(word),
  );
}

function getProduceGroup(description: string, term: string): ProduceRecallGroup | undefined {
  const produceItem = getProduceItem(term);
  if (!produceItem) return undefined;
  return isDirectProduceDescription(description, produceItem) ? 'direct' : 'related';
}

export function getRecallRelevance(description: string, term: string): RecallRelevance | null {
  const termWords = wordsFrom(term);
  const descriptionWords = wordsFrom(description);
  if (termWords.length === 0 || descriptionWords.length === 0) return null;

  const firstIndex = firstTermIndex(descriptionWords, termWords);
  if (firstIndex < 0) return null;
  if (hasObviousProduceMismatch(termWords, descriptionWords)) return null;
  if (hasKnownBrandMismatch(termWords, descriptionWords)) return null;

  if (firstIndex === 0) return 'high';
  if (firstIndex <= 2) return 'medium';
  return 'low';
}

function getRecallFieldRelevance(recall: FoodRecall, term: string): RecallRelevance | null {
  const fields = [
    recall.productDescription,
    recall.recallingFirm,
    recall.reasonForRecall,
    recall.summary ?? '',
  ];
  const relevanceRank = { high: 3, medium: 2, low: 1 } as const;
  const directMatches = fields
    .map((field) => getRecallRelevance(field, term))
    .filter((value): value is RecallRelevance => value !== null)
    .sort((left, right) => relevanceRank[right] - relevanceRank[left]);

  if (directMatches[0]) return directMatches[0];

  const termWords = wordsFrom(term);
  if (termWords.length === 0) return null;
  const recordWords = fields.flatMap(wordsFrom);
  const matchedWords = termWords.filter((termWord) =>
    recordWords.some((recordWord) => wordsMatch(recordWord, termWord)),
  ).length;
  if (matchedWords === 0) return null;
  if (matchedWords === termWords.length) return 'medium';
  return matchedWords / termWords.length >= 0.5 ? 'low' : null;
}

function recallDateValue(value: string) {
  const normalized = /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function rankAndFilterRecalls(recalls: FoodRecall[], term: string) {
  return recalls
    .map((recall, originalIndex) => ({
      recall: {
        ...recall,
        relevance:
          recall.searchMatch === 'word-fallback'
            ? 'low'
            : getRecallFieldRelevance(recall, term) ?? undefined,
        produceGroup: getProduceGroup(recall.productDescription, term),
      },
      originalIndex,
    }))
    .filter(({ recall }) => recall.relevance)
    .sort((left, right) => {
      const relevanceRank = { high: 3, medium: 2, low: 1 } as const;
      const produceGroupRank = { direct: 2, related: 1 } as const;
      const leftGroupRank = produceGroupRank[left.recall.produceGroup as ProduceRecallGroup] ?? 0;
      const rightGroupRank = produceGroupRank[right.recall.produceGroup as ProduceRecallGroup] ?? 0;
      const groupDifference = rightGroupRank - leftGroupRank;
      if (groupDifference) return groupDifference;

      const scoreDifference =
        relevanceRank[right.recall.relevance as RecallRelevance] -
        relevanceRank[left.recall.relevance as RecallRelevance];
      if (scoreDifference) return scoreDifference;

      const dateDifference =
        recallDateValue(right.recall.recallDate) - recallDateValue(left.recall.recallDate);
      if (dateDifference) return dateDifference;

      return left.originalIndex - right.originalIndex;
    })
    .map(({ recall }) => recall);
}

export function getRecallRelevanceNotice(term: string, recalls: FoodRecall[]) {
  if (getProduceItem(term)) return undefined;
  if (recalls[0]?.relevance !== 'low') return undefined;
  return `The following recalls mention “${term}” but may not be the same product. Review the details carefully.`;
}

export function splitRecallGroups(term: string, recalls: FoodRecall[]) {
  const produceItem = getProduceItem(term);
  if (!produceItem) {
    return {
      isProduceSearch: false,
      produceItem: undefined,
      directRecalls: recalls,
      relatedRecalls: [] as FoodRecall[],
    };
  }

  return {
    isProduceSearch: true,
    produceItem,
    directRecalls: recalls.filter((recall) => recall.produceGroup === 'direct'),
    relatedRecalls: recalls.filter((recall) => recall.produceGroup === 'related'),
  };
}