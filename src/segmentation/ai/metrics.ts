/**
 * Scoring of a prediction on the held-out test pixels, as the legacy
 * legacyPredictMask and the store's createConfusionMatrix did.
 */

import type { ConfusionMatrix } from '../../types/iris';
import type { TrainTestSplit } from './sampling';

export interface PredictionScore {
  /** Errors mask: 0 not tested, 1 correct, 2 wrong. */
  errors: Uint8Array;
  confusionMatrix: ConfusionMatrix;
}

/**
 * Compare `predicted` with the user's labels on the test pixels.
 *
 * The overall score is `n * prod(acc) / sum(acc)` over the usable classes,
 * the legacy formula. A class with no test pixels gives NaN, as before.
 */
export function scorePrediction(
  predicted: Uint8Array,
  split: TrainTestSplit,
  classNames: string[],
): PredictionScore {
  const classCount = classNames.length;
  const matrix: number[][] = Array.from({ length: classCount }, () => new Array(classCount).fill(0));
  const truePositives: { [classId: number]: number } = {};
  const tested: { [classId: number]: number } = {};
  for (const c of split.classes) {
    truePositives[c] = 0;
    tested[c] = 0;
  }

  const errors = new Uint8Array(predicted.length);
  for (let k = 0; k < split.testPixels.length; k++) {
    const i = split.testPixels[k];
    const label = split.testLabels[k];
    const guess = predicted[i];
    matrix[label][guess] += 1;
    tested[label]++;
    if (label === guess) {
      truePositives[label]++;
      errors[i] = 1;
    } else {
      errors[i] = 2;
    }
  }

  const perClass: number[] = [];
  let product = split.classes.length;
  let sum = 0;
  let worstClass: number | null = null;
  let worstAccuracy = 1;
  for (const c of split.classes) {
    const accuracy = truePositives[c] / tested[c];
    perClass[c] = accuracy;
    product *= accuracy;
    sum += accuracy;
    if (accuracy < worstAccuracy) {
      worstAccuracy = accuracy;
      worstClass = c;
    }
  }

  let totalSamples = 0;
  for (const row of matrix) for (const v of row) totalSamples += v;

  return {
    errors,
    confusionMatrix: {
      matrix,
      classCount,
      totalSamples,
      accuracyStats: {
        overall: split.classes.length > 0 && sum > 0 ? product / sum : 0,
        perClass,
        worstClass,
        worstAccuracy,
        truePositives,
      },
      timestamp: new Date(),
      classes: classNames,
    },
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
