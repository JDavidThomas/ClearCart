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
}

export interface RecallSearchResult {
  recalls: FoodRecall[];
  lastUpdated: string;
  fromCache: boolean;
}

export interface OpenFoodFactsProduct {
  barcode: string;
  name: string;
  brand: string;
  ingredients?: string;
}
