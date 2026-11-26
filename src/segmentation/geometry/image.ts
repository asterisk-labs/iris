import type { Size } from './brush';

/**
 * Image size from a shape array as served by the backend: `[height, width]`
 * (numpy order). The server derives it from the image file, so it is
 * always present and always matches the pixels; `images.shape` in the
 * project config is optional and validated against the file.
 */
export function imageSizeFromShape(shape: unknown): Size | null {
  if (!Array.isArray(shape) || shape.length < 2) return null;
  const [height, width] = shape;
  if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) return null;
  return { width, height };
}

/** Mask size from a mask area `[x0, y0, x1, y1]`. */
export function maskSizeFromArea(area: [number, number, number, number]): Size {
  const [x0, y0, x1, y1] = area;
  return { width: x1 - x0, height: y1 - y0 };
}
