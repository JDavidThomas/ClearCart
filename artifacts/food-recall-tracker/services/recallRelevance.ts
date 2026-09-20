import type { FoodRecall, RecallRelevance } from '@/types/recall';
import { cleanRecallSearchTerm } from './recallSearch';

const COMMON_PRODUCE_TERMS = new Set([
  'apple',
  'avocado',
  'banana',
  'blueberry',
  'broccoli',
  'cabbage',
  'carrot',
  'celery',
  'cucumber',
  'garlic',
  'grape',
  'kale',
  'lemon',
  'lettuce',
  'lime',
  'mango',
  'onion',
  'orange',
  'peach',
  'pear',
  'potato',
  'raspberry',
  'spinach',
  'strawberry',
  'tomato',
]);

const NON_FOOD_PRODUCT_WORDS = new Set([
  'aquarium',
  'cat',
  'cosmetic',
  'cough',
  'cream',
  'creme',
  'cleaner',
  'dog',
  'disinfectant',
  'drops',
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

function wordsFrom(value: string) {
  return cleanRecallSearchTerm(value).toLowerCase().split(' ').filter(Boolean);
}

function singularize(word: string) {
  if (word.endsWith('ies') && word.length > 3) return `${word.slice(0, -3)}y`;
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 2) return word.slice(0, -1);
  return word;
}

function wordsMatch(left: string, right: string) {
  return left === right || singularize(left) === singularize(right);
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
  if (termWords.length !== 1 || !COMMON_PRODUCE_TERMS.has(singularize(termWords[0]))) {
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

export function rankAndFilterRecalls(recalls: FoodRecall[], term: string) {
  return recalls
    .map((recall, originalIndex) => ({
      recall: {
        ...recall,
        relevance: getRecallRelevance(recall.productDescription, term) ?? undefined,
      },
      originalIndex,
    }))
    .filter(({ recall }) => recall.relevance)
    .sort((left, right) => {
      const relevanceRank = { high: 3, medium: 2, low: 1 } as const;
      const scoreDifference =
        relevanceRank[right.recall.relevance as RecallRelevance] -
        relevanceRank[left.recall.relevance as RecallRelevance];
      return scoreDifference || left.originalIndex - right.originalIndex;
    })
    .map(({ recall }) => recall);
}

export function getRecallRelevanceNotice(term: string, recalls: FoodRecall[]) {
  if (recalls[0]?.relevance !== 'low') return undefined;
  return `The following recalls mention “${term}” but may not be the same product. Review the details carefully.`;
}