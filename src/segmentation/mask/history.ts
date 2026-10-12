/**
 * Undo/redo for the final and user masks.
 *
 * Same model as before: a list of full snapshots with a cursor (`epoch`)
 * on the current one, at most `maxEntries` long. Recording a new state
 * drops everything after the cursor.
 */

import type { MaskSnapshot } from './MaskDocument';

export class MaskHistory {
  private entries: MaskSnapshot[] = [];
  private epoch = 0;

  constructor(readonly maxEntries = 30) {}

  /** Record the current state (after a stroke, load, reset or prediction). */
  record(state: MaskSnapshot): void {
    this.entries = this.entries.slice(0, this.epoch + 1);
    this.entries.push(state);
    if (this.entries.length > this.maxEntries) this.entries.shift();
    this.epoch = this.entries.length - 1;
  }

  /** Drop redo entries; called when an edit starts. */
  discardFuture(): void {
    this.entries = this.entries.slice(0, this.epoch + 1);
  }

  canUndo(): boolean {
    return this.entries.length > 1 && this.epoch > 0;
  }

  canRedo(): boolean {
    return this.epoch < this.entries.length - 1;
  }

  /** The state to restore, or null when there is nothing to undo. */
  undo(): MaskSnapshot | null {
    if (!this.canUndo()) return null;
    this.epoch--;
    return this.entries[this.epoch];
  }

  redo(): MaskSnapshot | null {
    if (!this.canRedo()) return null;
    this.epoch++;
    return this.entries[this.epoch];
  }

  clear(): void {
    this.entries = [];
    this.epoch = 0;
  }
}
