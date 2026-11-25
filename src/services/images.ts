/** Asking the server which image comes next for this user. */

import { appUrls, ensureOk } from './http';

/**
 * The image after `imageId`, or null when the project has no other image.
 * Asked for on each navigation because it depends on what has been annotated.
 */
export async function getNextImageId(imageId: string): Promise<string | null> {
  const response = await ensureOk(await fetch(
    `${appUrls().main}api/v1/images/${encodeURIComponent(imageId)}/next`,
    { credentials: 'same-origin' },
  ));
  return (await response.json()).image_id;
}
