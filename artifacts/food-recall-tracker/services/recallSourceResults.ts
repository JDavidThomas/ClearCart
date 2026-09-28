import type { FoodRecall } from '../types/recall.ts';

export interface FsisRecallSearchResult {
  recalls: FoodRecall[];
  sourceUnavailable?: 'fsis';
}

export interface CombinedRecallSources {
  recalls: FoodRecall[];
  sourceUnavailable?: 'fsis';
  fdaUnavailable?: boolean;
}

export function combineRecallSourceResults(
  fdaResult: PromiseSettledResult<FoodRecall[]>,
  fsisResult: PromiseSettledResult<FsisRecallSearchResult>,
): CombinedRecallSources {
  const fdaRecalls = fdaResult.status === 'fulfilled' ? fdaResult.value : [];
  const fsisData =
    fsisResult.status === 'fulfilled'
      ? fsisResult.value
      : { recalls: [], sourceUnavailable: 'fsis' as const };

  return {
    recalls: [...fdaRecalls, ...fsisData.recalls],
    sourceUnavailable: fsisData.sourceUnavailable,
    fdaUnavailable: fdaResult.status === 'rejected' ? true : undefined,
  };
}