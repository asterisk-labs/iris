import { describe, it, expect } from 'vitest';
import { paintedPixels, usableClasses } from './sampling';
import { aiRecommendation, toConfusionMatrix } from './metrics';
import type { PredictionResult } from '../../services/prediction';

describe('painted pixels', () => {
  it('lists every user pixel with its class', () => {
    const final = new Uint8Array([2, 1, 1, 0, 255]);
    const user = new Uint8Array([1, 0, 1, 1, 0]);
    expect(paintedPixels(final, user)).toEqual({ pixels: [0, 2, 3], labels: [2, 1, 0] });
  });

  it('counts only classes with more than 10 pixels as usable', () => {
    expect(usableClasses({ 0: 11, 1: 10, 2: 40, total: 61 })).toEqual([0, 2]);
  });
});

describe('scores from the server', () => {
  const result: PredictionResult = {
    mask: new Uint8Array(6),
    errors: new Uint8Array(6),
    confusionMatrix: [[2, 1, 0], [1, 1, 0], [0, 0, 0]],
    perClassAccuracy: { 0: 2 / 3, 1: 0.5 },
    overallAccuracy: 0.57,
    worstClass: 1,
    nTrain: 10,
    nTest: 5,
    model: { type: 'linear', n_features: 3, fit_seconds: 0.1 },
  };
  const matrix = toConfusionMatrix(result, ['a', 'b', 'c']);

  it('keeps the server matrix and accuracies', () => {
    expect(matrix.matrix).toEqual(result.confusionMatrix);
    expect(matrix.totalSamples).toBe(5);
    expect(matrix.accuracyStats.overall).toBe(0.57);
    expect(matrix.accuracyStats.perClass[0]).toBeCloseTo(2 / 3);
    expect(matrix.accuracyStats.truePositives).toEqual({ 0: 2, 1: 1 });
    expect(matrix.accuracyStats.worstAccuracy).toBe(0.5);
  });

  it('recommends more pixels for the worst class', () => {
    expect(aiRecommendation(matrix, 2, ['a', 'b', 'c'])).toEqual({
      text: 'Could you provide more training pixels for', className: 'b',
    });
    expect(aiRecommendation(null, 1, []).text).toBe('Draw at least 10 pixels from two classes!');
    expect(aiRecommendation(null, 2, []).text).toBe('Start the training!');
  });
});
