import { describe, it, expect } from 'vitest';
import { LegacyRng, splitTrainTest, usableClasses } from './sampling';
import { scorePrediction, aiRecommendation } from './metrics';

// Recorded from the legacy RNG in iris/static/javascripts/utils.js (seed 42)
const LEGACY = {
  ints: [1250496027, 1116302080, 1964818176, 1500480256, 1617229568, 1480547072, 1119088384, 326038272, 105359168, 486008448, 617108672, 2141111808],
  shuffle40: [3, 10, 37, 35, 29, 22, 21, 13, 39, 16, 30, 4, 31, 11, 14, 12, 0, 15, 32, 36, 33, 26, 38, 2, 6, 9, 18, 19, 28, 8, 7, 1, 5, 17, 24, 27, 25, 34, 20, 23],
  shuffle1000head: [188, 759, 265, 347, 114, 279, 375, 425, 353, 267, 340, 512, 551, 309, 56, 624, 594, 941, 874, 997],
  shuffle1000tail: [823, 834, 884, 102, 252, 356, 662, 701, 986, 284, 224, 48, 150, 517, 685, 750, 696, 913, 519, 582],
};

describe('LegacyRng', () => {
  it('reproduces the legacy sequence', () => {
    const r = new LegacyRng(42);
    expect(LEGACY.ints.map(() => r.nextInt())).toEqual(LEGACY.ints);
  });

  it('reproduces the legacy shuffles', () => {
    const a = Array.from({ length: 40 }, (_, i) => i);
    new LegacyRng(42).shuffle(a);
    expect(a).toEqual(LEGACY.shuffle40);
    const b = Array.from({ length: 1000 }, (_, i) => i);
    new LegacyRng(42).shuffle(b);
    expect(b.slice(0, 20)).toEqual(LEGACY.shuffle1000head);
    expect(b.slice(-20)).toEqual(LEGACY.shuffle1000tail);
  });
});

describe('splitTrainTest', () => {
  // 3 classes: class 0 has 30 painted pixels, class 1 has 20, class 2 only 5
  const n = 100;
  const final = new Uint8Array(n);
  const user = new Uint8Array(n);
  for (let i = 0; i < 30; i++) { final[i] = 0; user[i] = 1; }
  for (let i = 30; i < 50; i++) { final[i] = 1; user[i] = 1; }
  for (let i = 50; i < 55; i++) { final[i] = 2; user[i] = 1; }
  const counts = { 0: 30, 1: 20, 2: 5, total: 55 };

  it('uses only classes with more than 10 painted pixels', () => {
    expect(usableClasses(counts)).toEqual([0, 1]);
    const s = splitTrainTest(final, user, counts, { trainRatio: 0.5, maxTrainPixels: 1000 });
    expect(s.classes).toEqual([0, 1]);
    expect([...s.trainLabels, ...s.testLabels].every(c => c !== 2)).toBe(true);
  });

  it('takes round(count * ratio) per class for training, capped', () => {
    const s = splitTrainTest(final, user, counts, { trainRatio: 0.5, maxTrainPixels: 1000 });
    expect(s.trainLabels.filter(c => c === 0)).toHaveLength(15);
    expect(s.trainLabels.filter(c => c === 1)).toHaveLength(10);
    expect(s.testPixels).toHaveLength(25);
    const capped = splitTrainTest(final, user, counts, { trainRatio: 0.5, maxTrainPixels: 4 });
    expect(capped.trainPixels).toHaveLength(8);
    expect(capped.testPixels).toHaveLength(42);
  });

  it('is deterministic and partitions the usable pixels', () => {
    const a = splitTrainTest(final, user, counts, { trainRatio: 0.3, maxTrainPixels: 1000 });
    const b = splitTrainTest(final, user, counts, { trainRatio: 0.3, maxTrainPixels: 1000 });
    expect(a).toEqual(b);
    expect([...a.trainPixels, ...a.testPixels].sort((x, y) => x - y)).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });

  it('follows the legacy shuffle order', () => {
    // With 40 usable pixels the order is LEGACY.shuffle40; the first quota go to training
    const f = new Uint8Array(40);
    const u = new Uint8Array(40).fill(1);
    for (let i = 20; i < 40; i++) f[i] = 1;
    const s = splitTrainTest(f, u, { 0: 20, 1: 20, total: 40 }, { trainRatio: 0.25, maxTrainPixels: 1000 });
    const expectedTrain: number[] = [];
    const taken = [0, 0];
    for (const k of LEGACY.shuffle40) {
      const c = k < 20 ? 0 : 1;
      if (taken[c] < 5) { expectedTrain.push(k); taken[c]++; }
    }
    expect(s.trainPixels).toEqual(expectedTrain);
  });
});

describe('scorePrediction', () => {
  const split = {
    classes: [0, 1],
    trainPixels: [],
    trainLabels: [],
    testPixels: [0, 1, 2, 3, 4],
    testLabels: [0, 0, 0, 1, 1],
  };
  const predicted = new Uint8Array([0, 0, 1, 1, 0, 0]);
  const { errors, confusionMatrix } = scorePrediction(predicted, split, ['a', 'b', 'c']);

  it('marks test pixels correct or wrong', () => {
    expect(Array.from(errors)).toEqual([1, 1, 2, 1, 2, 0]);
  });

  it('builds the confusion matrix by actual then predicted class', () => {
    expect(confusionMatrix.matrix).toEqual([[2, 1, 0], [1, 1, 0], [0, 0, 0]]);
    expect(confusionMatrix.totalSamples).toBe(5);
  });

  it('scores with the legacy formula n * prod(acc) / sum(acc)', () => {
    const acc0 = 2 / 3, acc1 = 1 / 2;
    expect(confusionMatrix.accuracyStats.overall).toBeCloseTo((2 * acc0 * acc1) / (acc0 + acc1));
    expect(confusionMatrix.accuracyStats.worstClass).toBe(1);
    expect(confusionMatrix.accuracyStats.perClass[0]).toBeCloseTo(acc0);
  });

  it('recommends more pixels for the worst class', () => {
    expect(aiRecommendation(confusionMatrix, 2, ['a', 'b', 'c'])).toEqual({
      text: 'Could you provide more training pixels for', className: 'b',
    });
    expect(aiRecommendation(null, 1, []).text).toBe('Draw at least 10 pixels from two classes!');
    expect(aiRecommendation(null, 2, []).text).toBe('Start the training!');
  });
});
