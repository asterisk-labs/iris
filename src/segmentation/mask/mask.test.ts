import { describe, it, expect, vi } from 'vitest';
import { MaskDocument } from './MaskDocument';
import { MaskHistory } from './history';
import { renderMaskRect } from './palette';
import { encodeMasks, decodeMasks } from './codec';
import type { ClassConfig } from '../../types/iris';

const fullCount = (doc: MaskDocument, classCount: number) => {
  const counts: { [c: number]: number; total: number } = { total: 0 };
  for (let c = 0; c < classCount; c++) counts[c] = 0;
  for (let i = 0; i < doc.length; i++) {
    if (doc.user[i] && doc.final[i] < classCount) {
      counts[doc.final[i]]++;
      counts.total++;
    }
  }
  return counts;
};

describe('MaskDocument', () => {
  it('paint sets class and user flag; erase clears both', () => {
    const doc = new MaskDocument(4, 3, 3);
    doc.paint([0, 5], 2);
    expect(Array.from(doc.final)).toEqual([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(doc.user)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    doc.erase([5]);
    expect(doc.final[5]).toBe(0);
    expect(doc.user[5]).toBe(0);
    expect(doc.counts()).toEqual({ 0: 0, 1: 0, 2: 1, total: 1 });
  });

  it('keeps counts equal to a full recount through random edits', () => {
    const doc = new MaskDocument(20, 15, 4);
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let step = 0; step < 500; step++) {
      const indices = Array.from({ length: 1 + Math.floor(rand() * 20) }, () => Math.floor(rand() * doc.length));
      const r = rand();
      if (r < 0.6) doc.paint(indices, Math.floor(rand() * 4));
      else if (r < 0.9) doc.erase(indices);
      else {
        const predicted = new Uint8Array(doc.length).map(() => Math.floor(rand() * 4));
        doc.applyPrediction(predicted);
      }
      expect(doc.counts()).toEqual(fullCount(doc, 4));
    }
  });

  it('applyPrediction only fills pixels the user did not paint', () => {
    const doc = new MaskDocument(3, 1, 3);
    doc.paint([1], 2);
    doc.applyPrediction(new Uint8Array([1, 1, 1]));
    expect(Array.from(doc.final)).toEqual([1, 2, 1]);
    expect(Array.from(doc.user)).toEqual([0, 1, 0]);
  });

  it('reports the bounding rectangle of each change and bumps the revision', () => {
    const doc = new MaskDocument(10, 10, 2);
    const listener = vi.fn();
    doc.subscribe(listener);
    const before = doc.revision;
    const rect = doc.paint([3 * 10 + 4, 6 * 10 + 2, 5 * 10 + 7], 1);
    expect(rect).toEqual({ x: 2, y: 3, width: 6, height: 4 });
    expect(listener).toHaveBeenCalledWith(rect);
    expect(doc.revision).toBe(before + 1);
    expect(doc.paint([], 1)).toBeNull();
    expect(doc.revision).toBe(before + 1);
  });

  it('reset clears final and user but keeps the errors mask', () => {
    const doc = new MaskDocument(2, 1, 2);
    doc.paint([0, 1], 1);
    doc.setErrors(new Uint8Array([1, 2]));
    doc.reset();
    expect(Array.from(doc.final)).toEqual([0, 0]);
    expect(Array.from(doc.user)).toEqual([0, 0]);
    expect(Array.from(doc.errors)).toEqual([1, 2]);
    expect(doc.counts().total).toBe(0);
  });

  it('rejects data of the wrong size', () => {
    const doc = new MaskDocument(2, 2, 2);
    expect(() => doc.replace(new Uint8Array(3), new Uint8Array(4))).toThrow(/expected 4/);
  });
});

describe('MaskHistory', () => {
  const snap = (v: number) => ({ final: new Uint8Array([v]), user: new Uint8Array([v]) });

  it('undoes and redoes through recorded states', () => {
    const h = new MaskHistory();
    h.record(snap(0));
    h.record(snap(1));
    h.record(snap(2));
    expect(h.undo()?.final[0]).toBe(1);
    expect(h.undo()?.final[0]).toBe(0);
    expect(h.undo()).toBeNull();
    expect(h.redo()?.final[0]).toBe(1);
    expect(h.canRedo()).toBe(true);
  });

  it('recording after an undo drops the redo branch', () => {
    const h = new MaskHistory();
    h.record(snap(0));
    h.record(snap(1));
    h.undo();
    h.record(snap(5));
    expect(h.canRedo()).toBe(false);
    expect(h.undo()?.final[0]).toBe(0);
  });

  it('keeps at most maxEntries states', () => {
    const h = new MaskHistory(3);
    for (let v = 0; v < 6; v++) h.record(snap(v));
    expect(h.undo()?.final[0]).toBe(4);
    expect(h.undo()?.final[0]).toBe(3);
    expect(h.undo()).toBeNull();
  });
});

describe('renderMaskRect', () => {
  const classes: ClassConfig[] = [
    { name: 'clear', colour: [0, 0, 0, 0] },
    { name: 'cloud', colour: [255, 255, 0, 100], user_colour: [0, 255, 255, 255] },
  ];
  const doc = new MaskDocument(2, 2, 2);
  doc.paint([0], 1);
  doc.applyPrediction(new Uint8Array([0, 1, 1, 0]));
  doc.setErrors(new Uint8Array([0, 1, 2, 0]));
  const render = (type: 'final' | 'user' | 'errors', rect = { x: 0, y: 0, width: 2, height: 2 }) => {
    const out = new Uint8ClampedArray(rect.width * rect.height * 4);
    renderMaskRect(doc, type, classes, rect, out);
    return Array.from(out);
  };

  it('final shows every pixel in its class colour', () => {
    expect(render('final')).toEqual([255, 255, 0, 100, 255, 255, 0, 100, 255, 255, 0, 100, 0, 0, 0, 0]);
  });

  it('user shows only painted pixels, in user_colour', () => {
    expect(render('user')).toEqual([0, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 0, 255, 255, 255, 0]);
  });

  it('errors shows correct and wrong test pixels', () => {
    expect(render('errors')).toEqual([255, 255, 255, 0, 0, 255, 0, 70, 255, 70, 70, 255, 255, 255, 255, 0]);
  });

  it('renders a sub-rectangle', () => {
    expect(render('final', { x: 1, y: 1, width: 1, height: 1 })).toEqual([0, 0, 0, 0]);
  });
});

describe('mask codec', () => {
  it('round-trips', () => {
    const final = new Uint8Array([1, 2, 3]);
    const user = new Uint8Array([0, 1, 0]);
    const data = encodeMasks(final, user);
    expect(Array.from(data)).toEqual([254, 1, 2, 3, 0, 1, 0, 254]);
    const back = decodeMasks(data, 3);
    expect(Array.from(back.final)).toEqual([1, 2, 3]);
    expect(Array.from(back.user)).toEqual([0, 1, 0]);
  });

  it('rejects bad length and bad markers', () => {
    expect(() => decodeMasks(new Uint8Array(7), 3)).toThrow(/expected 8/);
    expect(() => decodeMasks(new Uint8Array([254, 0, 0, 0, 0, 0, 0, 1]), 3)).toThrow(/corrupt/);
  });
});
