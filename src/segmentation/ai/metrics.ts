/**
 * The scores of a prediction, computed by the server, in the form the
 * confusion matrix and the AI recommendation show them.
 */

import type { ConfusionMatrix } from '../../types/iris';
import type { PredictionResult } from '../../services/prediction';

export function toConfusionMatrix(result: PredictionResult, classNames: string[]): ConfusionMatrix {
  const perClass: number[] = [];
  const truePositives: { [classId: number]: number } = {};
  for (const [id, accuracy] of Object.entries(result.perClassAccuracy)) {
    const c = Number(id);
    perClass[c] = accuracy;
    truePositives[c] = result.confusionMatrix[c]?.[c] ?? 0;
  }
  const worst = result.worstClass;
  return {
    matrix: result.confusionMatrix,
    classCount: classNames.length,
    totalSamples: result.nTest,
    accuracyStats: {
      overall: result.overallAccuracy,
      perClass,
      worstClass: worst,
      worstAccuracy: worst === null ? 1 : result.perClassAccuracy[String(worst)],
      truePositives,
    },
    timestamp: new Date(),
    classes: classNames,
  };
}

export interface Recommendation {
  text: string;
  /** Class name to show emphasised after the text, if any. */
  className?: string;
}

/**
 * The hint shown next to the AI score. Pass the confusion matrix only
 * while it describes the current mask (i.e. no edits since prediction).
 */
export function aiRecommendation(
  confusionMatrix: ConfusionMatrix | null,
  usableClassCount: number,
  classNames: string[],
): Recommendation {
  if (!confusionMatrix) {
    return {
      text: usableClassCount >= 2 ? 'Start the training!' : 'Draw at least 10 pixels from two classes!',
    };
  }
  const worst = confusionMatrix.accuracyStats.worstClass;
  if (worst === null) return { text: 'Draw more training pixels!' };
  return {
    text: 'Could you provide more training pixels for',
    className: classNames[worst] ?? `Class ${worst}`,
  };
}
