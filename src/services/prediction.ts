/**
 * Client for /segmentation/predict_mask: the server fits the per-image
 * model on the training pixels and returns one class id per mask pixel.
 */

import { appUrls, ensureOk, readBytes } from './http';

export async function predictMask(
  imageId: string,
  trainPixels: number[],
  trainLabels: number[],
): Promise<Uint8Array> {
  const response = await fetch(`${appUrls().segmentation}predict_mask/${encodeURIComponent(imageId)}`, {
    method: 'POST',
    body: JSON.stringify({ user_pixels: trainPixels, user_labels: trainLabels }),
    credentials: 'same-origin',
  });
  await ensureOk(response);
  return readBytes(response);
}
