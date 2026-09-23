import type { OpenFoodFactsProduct } from '../../types/recall.ts';

export const highSugarCupcake: OpenFoodFactsProduct = {
  barcode: 'fixture-cupcake',
  name: 'Fixture Vanilla Cupcake',
  brand: 'Fixture Bakery',
  ingredients: 'sugar, wheat flour, eggs, butter',
  nutrition: {
    sugars100g: 28,
    sodium100g: 180,
    carbohydrates100g: 45,
    nutriScoreGrade: 'e',
  },
};

export const highSodiumSoup: OpenFoodFactsProduct = {
  barcode: 'fixture-soup',
  name: 'Fixture Vegetable Soup',
  brand: 'Fixture Kitchen',
  ingredients: 'water, vegetables, vegetable broth, salt',
  nutrition: {
    sugars100g: 2,
    sodium100g: 820,
    carbohydrates100g: 8,
    nutriScoreGrade: 'd',
  },
};

export const glutenFreeCupcake: OpenFoodFactsProduct = {
  barcode: 'fixture-gluten-free-cupcake',
  name: 'Fixture Gluten-Free Chocolate Cupcake',
  brand: 'Fixture Bakery',
  ingredients: 'rice flour, cocoa, sugar, eggs',
  allergens: 'eggs',
  nutrition: {
    sugars100g: 16,
    sodium100g: 150,
    carbohydrates100g: 32,
    nutriScoreGrade: 'c',
  },
};

export const incompleteProduct: OpenFoodFactsProduct = {
  barcode: 'fixture-incomplete',
  name: 'Fixture Product With Missing Nutrition',
  brand: 'Fixture Kitchen',
};