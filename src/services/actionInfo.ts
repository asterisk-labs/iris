/**
 * The user's notes on an annotated image: how difficult it was, free-text
 * notes, and whether they consider the mask complete.
 */

import { appUrls, ensureOk } from './http';

export interface ActionInfo {
  id: number;
  difficulty: number;
  notes: string;
  complete: boolean;
}

/** The current user's action info for an image, or null if there is none. */
export async function getActionInfo(imageId: string): Promise<ActionInfo | null> {
  const response = await fetch(
    `${appUrls().main}get_action_info/${encodeURIComponent(imageId)}/segmentation`,
    { credentials: 'same-origin' },
  );
  if (response.status >= 400) return null;
  return response.json();
}

export async function setActionInfo(
  actionId: number,
  info: Pick<ActionInfo, 'difficulty' | 'notes' | 'complete'>,
): Promise<void> {
  await ensureOk(await fetch(`${appUrls().main}set_action_info/${actionId}`, {
    method: 'POST',
    body: JSON.stringify(info),
    credentials: 'same-origin',
  }));
}
