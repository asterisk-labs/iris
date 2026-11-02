/**
 * Mask colours and rendering to RGBA, as the legacy
 * get_current_mask_and_colours / reload_hidden_mask did.
 *
 *   final  - every pixel in its class colour
 *   user   - only user-painted pixels, in the class's user_colour if set
 *   errors - test pixels: green where correct, red where wrong
 */

import type { ClassConfig } from '../../types/iris';
import type { DirtyRect, MaskDocument } from './MaskDocument';

export type MaskType = 'final' | 'user' | 'errors';
export type RGBA = [number, number, number, number];

const TRANSPARENT: RGBA = [255, 255, 255, 0];
const ERROR_COLOURS: RGBA[] = [TRANSPARENT, [0, 255, 0, 70], [255, 70, 70, 255]];

/** Colour of each class id, for the final and user views. */
function classColours(classes: ClassConfig[], user: boolean): RGBA[] {
  return classes.map(c => (user && c.user_colour ? c.user_colour : c.colour));
}

/**
 * Write the RGBA pixels of `rect` into `out` (length rect.width *
 * rect.height * 4, row-major), e.g. an ImageData's data.
 * Class ids without a colour are drawn transparent.
 */
export function renderMaskRect(
  doc: MaskDocument,
  maskType: MaskType,
  classes: ClassConfig[],
  rect: DirtyRect,
  out: Uint8ClampedArray,
): void {
  const colours = maskType === 'errors' ? ERROR_COLOURS : classColours(classes, maskType === 'user');
  const source = maskType === 'errors' ? doc.errors : doc.final;
  const userOnly = maskType === 'user';
  const w = doc.width;
  let o = 0;
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    let i = y * w + rect.x;
    for (let x = 0; x < rect.width; x++, i++, o += 4) {
      const colour = userOnly && !doc.user[i] ? TRANSPARENT : (colours[source[i]] ?? TRANSPARENT);
      out[o] = colour[0];
      out[o + 1] = colour[1];
      out[o + 2] = colour[2];
      out[o + 3] = colour[3];
    }
  }
}

/** CSS colour string for an RGBA tuple whose alpha is 0..255. */
export function rgbaToCss(c: RGBA): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`;
}
