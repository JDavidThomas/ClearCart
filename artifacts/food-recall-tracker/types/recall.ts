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
}

export interface RecallSearchResult {
  recalls: FoodRecall[];
  lastUpdated: string;
  fromCache: boolean;
}
