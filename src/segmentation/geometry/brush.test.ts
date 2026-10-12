import { describe, it, expect } from 'vitest';
import { brushPixels, brushOffset, roundHalfUp, strokePoints, BrushStamp, Rect } from './brush';
import legacy from './__fixtures__/legacyBrush.json';

interface LegacyCase {
  shape: 'square' | 'round';
  size: number;
  tool: 'draw' | 'eraser';
  cursor: [number, number];
  maskArea: [number, number, number, number];
  maskShape: [number, number];
  canvasBounds: [number, number, number, number];
  painted: number[];
}

const toStamp = (c: LegacyCase): BrushStamp => ({
  shape: c.shape,
  size: c.size,
  cursor: c.cursor,
  maskArea: c.maskArea,
  maskSize: { width: c.maskShape[0], height: c.maskShape[1] },
  visible: { x0: c.canvasBounds[0], y0: c.canvasBounds[1], x1: c.canvasBounds[2], y1: c.canvasBounds[3] },
});

/** Whether the legacy off-by-one clamp at the far edges affected this case. */
const touchesFarEdge = (c: LegacyCase) => {
  const offset = brushOffset(c.size);
  const xEnd = Math.min(roundHalfUp(c.canvasBounds[2]), c.cursor[0] + offset + c.size) - c.maskArea[0];
  const yEnd = Math.min(roundHalfUp(c.canvasBounds[3]), c.cursor[1] + offset + c.size) - c.maskArea[1];
  return xEnd > c.maskShape[0] - 1 || yEnd > c.maskShape[1] - 1;
};

const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

describe('brushPixels matches the legacy brush', () => {
  const cases = (legacy as { cases: LegacyCase[] }).cases;
  const comparable = cases.filter(c => !touchesFarEdge(c));

  it('has a meaningful number of comparable fixtures', () => {
    expect(comparable.length).toBeGreaterThan(100);
  });

  it.each(comparable.map(c => [`${c.tool} ${c.shape} ${c.size} at ${c.cursor} clip ${c.canvasBounds[0]}`, c] as const))(
    '%s',
    (_name, c) => {
      expect(sorted(brushPixels(toStamp(c)))).toEqual(sorted(c.painted));
    },
  );
});

describe('brushPixels', () => {
  const everywhere: Rect = { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 };
  const base = {
    maskArea: [0, 0, 10, 8] as [number, number, number, number],
    maskSize: { width: 10, height: 8 },
    visible: everywhere,
  };

  it('can paint the last column and row of the mask', () => {
    expect(brushPixels({ ...base, shape: 'square', size: 1, cursor: [9, 7] })).toEqual([7 * 10 + 9]);
    expect(sorted(brushPixels({ ...base, shape: 'square', size: 2, cursor: [8, 6] }))).toEqual([
      6 * 10 + 8, 6 * 10 + 9, 7 * 10 + 8, 7 * 10 + 9,
    ]);
  });

  it('never returns pixels outside the mask', () => {
    for (const shape of ['square', 'round'] as const) {
      for (let size = 1; size <= 12; size++) {
        for (const cursor of [[-3, -3], [0, 0], [9, 7], [12, 10], [5, 4]] as Array<[number, number]>) {
          for (const i of brushPixels({ ...base, shape, size, cursor })) {
            expect(i).toBeGreaterThanOrEqual(0);
            expect(i).toBeLessThan(80);
          }
        }
      }
    }
  });

  it('returns no duplicates', () => {
    for (const shape of ['square', 'round'] as const) {
      for (let size = 1; size <= 12; size++) {
        const px = brushPixels({ ...base, shape, size, cursor: [5, 4] });
        expect(new Set(px).size).toBe(px.length);
      }
    }
  });
});

describe('strokePoints', () => {
  it('includes both ends', () => {
    expect(strokePoints([2, 3], [2, 3])).toEqual([[2, 3]]);
    const pts = strokePoints([0, 0], [5, 2]);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([5, 2]);
  });

  it('steps by at most one pixel in each axis', () => {
    for (const [from, to] of [[[0, 0], [7, -3]], [[4, 9], [-2, 1]], [[0, 0], [0, -6]]] as Array<[[number, number], [number, number]]>) {
      const pts = strokePoints(from, to);
      for (let i = 1; i < pts.length; i++) {
        expect(Math.abs(pts[i][0] - pts[i - 1][0])).toBeLessThanOrEqual(1);
        expect(Math.abs(pts[i][1] - pts[i - 1][1])).toBeLessThanOrEqual(1);
      }
      expect(pts.length).toBe(Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])) + 1);
    }
  });
});
