import { describe, it, expect } from 'vitest';
import {
  FIT, zoomAt, panBy, clampToImage, canvasToImage, imageToCanvas, visibleRect, toMatrix,
  clientToCanvasPixel, canvasPixelToImagePixel, isFit, ViewTransform,
} from './transform';
import type { Size } from './brush';

/**
 * Model of the legacy code: a per-canvas matrix (a, d, e, f; no rotation)
 * changed by ctx.translate/scale, then constrain_view.
 */
class LegacyCanvas {
  a: number; d: number; e = 0; f = 0;
  constructor(public canvas: Size, public image: Size) {
    this.a = canvas.width / image.width;
    this.d = canvas.height / image.height;
  }
  translate(x: number, y: number) { this.e += this.a * x; this.f += this.d * y; }
  scale(s: number) { this.a *= s; this.d *= s; }
  constrain(scale: number) {
    if (this.a * scale < this.canvas.width / this.image.width) {
      this.a = this.canvas.width / this.image.width;
      this.d = this.canvas.height / this.image.height;
      this.e = 0; this.f = 0;
    }
    if (this.e > 0) this.e -= this.e;
    if (this.f > 0) this.f -= this.f;
    const brX = this.a * this.image.width + this.e;
    const brY = this.d * this.image.height + this.f;
    if (brX < this.canvas.width) this.e -= brX - this.canvas.width;
    if (brY < this.canvas.height) this.f -= brY - this.canvas.height;
  }
  zoom(delta: number, at: [number, number]) {
    const factor = Math.pow(1.1, delta);
    this.translate(at[0], at[1]);
    this.scale(factor);
    this.translate(-at[0], -at[1]);
    this.constrain(factor);
  }
  move(dx: number, dy: number) {
    this.translate(dx, dy);
    this.constrain(1);
  }
  toView(): ViewTransform {
    return {
      zoom: this.a / (this.canvas.width / this.image.width),
      originX: -this.e / this.a,
      originY: -this.f / this.d,
    };
  }
}

const close = (a: ViewTransform, b: ViewTransform) => {
  expect(a.zoom).toBeCloseTo(b.zoom, 9);
  expect(a.originX).toBeCloseTo(b.originX, 6);
  expect(a.originY).toBeCloseTo(b.originY, 6);
};

/** Small deterministic PRNG for repeatable random sequences. */
const prng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

describe('zoomAt and panBy match the legacy canvas maths', () => {
  for (const [canvas, image] of [
    [{ width: 600, height: 600 }, { width: 512, height: 512 }],
    [{ width: 413, height: 413 }, { width: 1000, height: 1000 }],
    [{ width: 800, height: 400 }, { width: 1024, height: 512 }],
  ] as Array<[Size, Size]>) {
    it(`random zoom/pan sequences, canvas ${canvas.width}x${canvas.height}, image ${image.width}x${image.height}`, () => {
      const rand = prng(canvas.width * 7 + image.width);
      for (let run = 0; run < 20; run++) {
        const legacy = new LegacyCanvas(canvas, image);
        let t: ViewTransform = { ...FIT };
        for (let step = 0; step < 40; step++) {
          if (rand() < 0.6) {
            const delta = rand() < 0.65 ? 1 : -1;
            const at: [number, number] = [Math.round(rand() * image.width), Math.round(rand() * image.height)];
            legacy.zoom(delta, at);
            t = zoomAt(t, image, Math.pow(1.1, delta), at);
          } else {
            const dx = Math.round((rand() - 0.5) * 60);
            const dy = Math.round((rand() - 0.5) * 60);
            legacy.move(dx, dy);
            t = panBy(t, image, dx, dy);
          }
          close(t, legacy.toView());
        }
      }
    });
  }

  it('snaps back to fit when zooming out close to the fit scale', () => {
    const image = { width: 100, height: 100 };
    const zoomed = zoomAt(FIT, image, 1.1, [50, 50]);
    expect(zoomed.zoom).toBeCloseTo(1.1);
    expect(isFit(zoomAt(zoomed, image, 1 / 1.1, [50, 50]))).toBe(true);
  });
});

describe('coordinate conversion', () => {
  const canvas = { width: 400, height: 200 };
  const image = { width: 1000, height: 500 };
  const t: ViewTransform = { zoom: 2, originX: 100, originY: 50 };

  it('canvasToImage and imageToCanvas are inverse', () => {
    for (const p of [[0, 0], [400, 200], [123.5, 77]] as Array<[number, number]>) {
      const back = imageToCanvas(t, canvas, image, canvasToImage(t, canvas, image, p));
      expect(back[0]).toBeCloseTo(p[0]);
      expect(back[1]).toBeCloseTo(p[1]);
    }
  });

  it('visibleRect spans the canvas', () => {
    expect(visibleRect(t, canvas, image)).toEqual({ x0: 100, y0: 50, x1: 600, y1: 300 });
  });

  it('toMatrix maps image points as imageToCanvas does', () => {
    const [a, , , d, e, f] = toMatrix(t, canvas, image);
    const p: [number, number] = [300, 120];
    const q = imageToCanvas(t, canvas, image, p);
    expect(a * p[0] + e).toBeCloseTo(q[0]);
    expect(d * p[1] + f).toBeCloseTo(q[1]);
  });

  it('clampToImage keeps the image covering the canvas', () => {
    expect(clampToImage({ zoom: 2, originX: -10, originY: 400 }, image)).toEqual({ zoom: 2, originX: 0, originY: 250 });
  });

  it('clientToCanvasPixel scales CSS pixels to canvas pixels and rounds like the legacy code', () => {
    const rect = { left: 10, top: 20, width: 200, height: 100 };
    expect(clientToCanvasPixel([110, 70], rect, canvas)).toEqual([200, 100]);
    expect(clientToCanvasPixel([10.6, 20.2], rect, canvas)).toEqual([1, 0]);
  });

  it('canvasPixelToImagePixel rounds to whole image pixels', () => {
    expect(canvasPixelToImagePixel(FIT, canvas, image, [3, 3])).toEqual([8, 8]);
  });
});
