/**
 * The fields returned by the openFDA food enforcement endpoint that the app
 * needs to show a plain-language recall summary.
 */
export interface FoodRecall {
  recallNumber?: string;
  productDescription: string;
  reasonForRecall: string;
  recallingFirm: string;
  recallDate: string;
  classification: string;
  status?: string;
  officialUrl: string;
  source?: 'FDA' | 'USDA FSIS';
  summary?: string;
  recallType?: string;
  relatedToOutbreak?: boolean;
  relevance?: RecallRelevance;
  produceGroup?: ProduceRecallGroup;
}

export type RecallRelevance = 'high' | 'medium' | 'low';
export type ProduceRecallGroup = 'direct' | 'related';

export interface RecallSearchResult {
  recalls: FoodRecall[];
  relatedRecalls?: FoodRecall[];
  lastUpdated: string;
  fromCache: boolean;
  relevanceNotice?: string;
  isProduceSearch?: boolean;
  produceItem?: string;
}

export interface OpenFoodFactsProduct {
  barcode: string;
  name: string;
  brand: string;
  ingredients?: string;
}
