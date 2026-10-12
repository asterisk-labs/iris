/**
 * The mask being edited for one image.
 *
 * Three flat arrays of `width * height` bytes, indexed `y * width + x`:
 *
 *   final  - class id of every pixel, painted or predicted
 *   user   - 1 where the user painted the pixel, 0 where the AI filled it
 *   errors - 0 not tested, 1 test pixel predicted correctly, 2 wrongly
 *
 * The arrays are mutated in place; listeners are told which rectangle
 * changed so canvases redraw only that. Per-class counts of user pixels
 * are kept up to date incrementally instead of rescanning the mask.
 */

export interface DirtyRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MaskListener = (dirty: DirtyRect) => void;

export interface MaskSnapshot {
  final: Uint8Array;
  user: Uint8Array;
}

export class MaskDocument {
  readonly width: number;
  readonly height: number;
  final: Uint8Array;
  user: Uint8Array;
  errors: Uint8Array;
  /** Increases on every change; compare against a saved value to detect edits. */
  revision = 0;

  private classCount: number;
  private userCounts: number[];
  private userTotal = 0;
  private listeners = new Set<MaskListener>();

  constructor(width: number, height: number, classCount: number) {
    this.width = width;
    this.height = height;
    this.classCount = classCount;
    const n = width * height;
    this.final = new Uint8Array(n);
    this.user = new Uint8Array(n);
    this.errors = new Uint8Array(n);
    this.userCounts = new Array(classCount).fill(0);
  }

  get length(): number {
    return this.width * this.height;
  }

  /** User-painted pixels per class, as `{[classId]: n, total}`. */
  counts(): { [classId: number]: number; total: number } {
    const out: { [classId: number]: number; total: number } = { total: this.userTotal };
    this.userCounts.forEach((n, c) => { out[c] = n; });
    return out;
  }

  subscribe(listener: MaskListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Set pixels to `classId` and mark them as painted by the user. */
  paint(indices: Iterable<number>, classId: number): DirtyRect | null {
    return this.write(indices, classId, 1);
  }

  /** Clear pixels: class 0, not painted by the user. */
  erase(indices: Iterable<number>): DirtyRect | null {
    return this.write(indices, 0, 0);
  }

  /** Fill every pixel the user has not painted with the predicted class. */
  applyPrediction(predicted: Uint8Array): void {
    this.checkLength(predicted);
    for (let i = 0; i < predicted.length; i++) {
      if (!this.user[i]) this.final[i] = predicted[i];
    }
    this.changed(this.fullRect());
  }

  setErrors(errors: Uint8Array): void {
    this.checkLength(errors);
    this.errors.set(errors);
    this.changed(this.fullRect());
  }

  /** Replace the final and user masks (load, reset, undo, redo). */
  replace(final: Uint8Array, user: Uint8Array): void {
    this.checkLength(final);
    this.checkLength(user);
    this.final.set(final);
    this.user.set(user);
    this.recount();
    this.changed(this.fullRect());
  }

  /** Clear the final and user masks. The errors mask is kept, as before. */
  reset(): void {
    this.final.fill(0);
    this.user.fill(0);
    this.recount();
    this.changed(this.fullRect());
  }

  snapshot(): MaskSnapshot {
    return { final: new Uint8Array(this.final), user: new Uint8Array(this.user) };
  }

  /** Change the number of classes (counts for ids >= classCount are not kept). */
  setClassCount(classCount: number): void {
    this.classCount = classCount;
    this.recount();
  }

  private write(indices: Iterable<number>, classId: number, userValue: number): DirtyRect | null {
    const w = this.width;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const i of indices) {
      if (i < 0 || i >= this.final.length) continue;
      this.uncount(i);
      this.final[i] = classId;
      this.user[i] = userValue;
      this.count(i);
      const x = i % w;
      const y = (i - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (minX === Infinity) return null;
    const rect = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
    this.changed(rect);
    return rect;
  }

  private count(i: number) {
    if (this.user[i] && this.final[i] < this.classCount) {
      this.userCounts[this.final[i]]++;
      this.userTotal++;
    }
  }

  private uncount(i: number) {
    if (this.user[i] && this.final[i] < this.classCount) {
      this.userCounts[this.final[i]]--;
      this.userTotal--;
    }
  }

  private recount() {
    this.userCounts = new Array(this.classCount).fill(0);
    this.userTotal = 0;
    for (let i = 0; i < this.user.length; i++) this.count(i);
  }

  private fullRect(): DirtyRect {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }

  private changed(rect: DirtyRect) {
    this.revision++;
    this.listeners.forEach(l => l(rect));
  }

  private checkLength(a: Uint8Array) {
    if (a.length !== this.length) {
      throw new Error(`Mask data has ${a.length} pixels, expected ${this.length}`);
    }
  }
}
