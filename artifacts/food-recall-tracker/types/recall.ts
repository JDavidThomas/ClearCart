/**
 * The fields returned by the openFDA food enforcement endpoint that the app
 * needs to show a plain-language recall summary.
 */
export interface FoodRecall {
  recallNumber?: string;
  productDescription: string;
  codeInfo?: string;
  reasonForRecall: string;
  recallingFirm: string;
  recallDate: string;
  classification: string;
  status?: string;
  officialUrl: string;
  source?: 'FDA';
  summary?: string;
  relevance?: RecallRelevance;
  produceGroup?: ProduceRecallGroup;
}

export type RecallRelevance = 'high' | 'medium' | 'low';
export type ProduceRecallGroup = 'direct' | 'related';

export interface RecallNewsArticle {
  title: string;
  description?: string;
  url: string;
  publishedAt: string;
  source: string;
}

export interface RecallNewsDiagnostics {
  requestUrl: string | null;
  httpStatus: number | null;
  rawArticleCount: number | null;
  filteredArticleCount: number | null;
  error: string | null;
}

export interface RecallSearchResult {
  recalls: FoodRecall[];
  relatedRecalls?: FoodRecall[];
  recentNews?: RecallNewsArticle[];
  newsUnavailable?: boolean;
  newsDiagnostics?: RecallNewsDiagnostics;
  lastUpdated: string;
  fromCache: boolean;
  relevanceNotice?: string;
  isProduceSearch?: boolean;
  produceItem?: string;
  fdaUnavailable?: boolean;
}

export interface OpenFoodFactsProduct {
  barcode: string;
  name: string;
  brand: string;
  ingredients?: string;
  allergens?: string;
  nutrition?: OpenFoodFactsNutrition;
}

export interface OpenFoodFactsNutrition {
  sugars100g?: number;
  sodium100g?: number;
  saturatedFat100g?: number;
  carbohydrates100g?: number;
  fiber100g?: number;
  proteins100g?: number;
  fat100g?: number;
  energyKcal100g?: number;
  potassium100g?: number;
  nutriScoreGrade?: string;
  novaGroup?: number;
}
