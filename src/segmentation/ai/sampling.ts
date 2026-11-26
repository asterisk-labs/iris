/**
 * Which painted pixels can train the per-image AI. The split into training
 * and test pixels happens on the server (iris/ml/sampling.py).
 */

/** A class needs more than this many painted pixels to be used. */
export const MIN_CLASS_PIXELS = 10;
/** Prediction needs at least this many usable classes. */
export const MIN_CLASSES = 2;

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

/** Every pixel the user painted, and its class. */
export function paintedPixels(final: Uint8Array, user: Uint8Array): { pixels: number[]; labels: number[] } {
  const pixels: number[] = [];
  const labels: number[] = [];
  for (let i = 0; i < user.length; i++) {
    if (user[i]) {
      pixels.push(i);
      labels.push(final[i]);
    }
  }
  return { pixels, labels };
}
