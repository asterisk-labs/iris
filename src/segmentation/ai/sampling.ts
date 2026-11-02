/**
 * Training/test split of the user's painted pixels for the per-image AI,
 * ported from the legacy legacyPredictMask.
 *
 * Only classes with more than MIN_CLASS_PIXELS painted pixels take part.
 * Their pixels are shuffled with a fixed seed; per class, the first
 * min(round(count * trainRatio), maxTrainPixels) go to training and the
 * rest are held out for testing.
 */

/** A class needs more than this many painted pixels to be used. */
export const MIN_CLASS_PIXELS = 10;
/** Prediction needs at least this many usable classes. */
export const MIN_CLASSES = 2;

/**
 * The legacy linear congruential generator (GCC constants), computed in
 * float64 exactly as the legacy code did so that splits are unchanged.
 * The products exceed 2^53, so precision is lost; keep it that way.
 */
export class LegacyRng {
  private readonly m = 0x80000000;
  private readonly a = 1103515245;
  private readonly c = 12345;
  private state: number;

  constructor(seed: number) {
    this.state = seed ? seed : Math.floor(Math.random() * (this.m - 1));
  }

  nextInt(): number {
    this.state = (this.a * this.state + this.c) % this.m;
    return this.state;
  }

  /** In [0, 1]. */
  random(): number {
    return this.nextInt() / (this.m - 1);
  }

  shuffle<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}

export interface SplitOptions {
  trainRatio: number;
  maxTrainPixels: number;
  seed?: number;
}

export interface TrainTestSplit {
  /** Classes with enough painted pixels, ascending. */
  classes: number[];
  trainPixels: number[];
  trainLabels: number[];
  testPixels: number[];
  testLabels: number[];
}

const roundHalfUp = (x: number) => (x + 0.5) | 0;

/** User-painted pixels per class, plus the total. */
export type ClassCounts = { [classId: number]: number; total: number };

/** Class ids with more than MIN_CLASS_PIXELS user pixels. */
export function usableClasses(counts: ClassCounts): number[] {
  return Object.keys(counts)
    .filter(k => k !== 'total')
    .map(k => parseInt(k, 10))
    .filter(c => counts[c] > MIN_CLASS_PIXELS)
    .sort((a, b) => a - b);
}

export function splitTrainTest(
  final: Uint8Array,
  user: Uint8Array,
  counts: ClassCounts,
  { trainRatio, maxTrainPixels, seed = 42 }: SplitOptions,
): TrainTestSplit {
  const classes = usableClasses(counts);

  const pixels: number[] = [];
  const labels: number[] = [];
  for (let i = 0; i < user.length; i++) {
    if (user[i] && counts[final[i]] > MIN_CLASS_PIXELS) {
      pixels.push(i);
      labels.push(final[i]);
    }
  }

  const order = pixels.map((_, i) => i);
  new LegacyRng(seed).shuffle(order);

  const quota: { [classId: number]: number } = {};
  const taken: { [classId: number]: number } = {};
  for (const c of classes) {
    quota[c] = Math.min(roundHalfUp((counts[c] || 0) * trainRatio), maxTrainPixels);
    taken[c] = 0;
  }

  const split: TrainTestSplit = { classes, trainPixels: [], trainLabels: [], testPixels: [], testLabels: [] };
  for (const k of order) {
    const c = labels[k];
    if (taken[c] < quota[c]) {
      split.trainPixels.push(pixels[k]);
      split.trainLabels.push(c);
      taken[c]++;
    } else {
      split.testPixels.push(pixels[k]);
      split.testLabels.push(c);
    }
  }
  return split;
}
