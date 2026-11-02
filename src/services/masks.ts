/**
 * Loading and saving the current user's mask for an image.
 * Wire format: see segmentation/mask/codec.ts.
 */

import { appUrls, ensureOk, readBytes } from './http';
import { decodeMasks, encodeMasks } from '../segmentation/mask/codec';

/** The user's masks for an image, or null if they have none yet. */
export async function loadMask(
  imageId: string,
  pixelCount: number,
): Promise<{ final: Uint8Array; user: Uint8Array } | null> {
  const response = await fetch(`${appUrls().segmentation}load_mask/${encodeURIComponent(imageId)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (response.status === 404) return null;
  await ensureOk(response);
  return decodeMasks(await readBytes(response), pixelCount);
}

export async function saveMask(imageId: string, final: Uint8Array, user: Uint8Array): Promise<void> {
  const body = encodeMasks(final, user);
  await ensureOk(await fetch(`${appUrls().segmentation}save_mask/${encodeURIComponent(imageId)}`, {
    method: 'POST',
    body: body as BodyInit,
    headers: { 'Content-Type': 'application/octet-stream' },
    credentials: 'same-origin',
  }));
}

/** Fire-and-forget save that survives the page being closed. */
export function saveMaskOnUnload(imageId: string, final: Uint8Array, user: Uint8Array): boolean {
  const blob = new Blob([encodeMasks(final, user) as BlobPart], { type: 'application/octet-stream' });
  return navigator.sendBeacon(`${appUrls().segmentation}save_mask/${encodeURIComponent(imageId)}`, blob);
}
