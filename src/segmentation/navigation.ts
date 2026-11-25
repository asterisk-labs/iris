/**
 * Moving between images. Each image is its own page load
 * (/segmentation/?image_id=...); unsaved changes are saved first or, on
 * page hide, by the beacon in segmentation-app.
 */

import { useSegmentationStore } from '../stores/segmentationStore';
import { AuthError, imageUrl } from '../services/http';
import { getActionInfo } from '../services/actionInfo';
import { getNextImageId } from '../services/images';
import { recordStep, stepBack } from './trail';

const store = () => useSegmentationStore.getState();

export { imageUrl };

export function goToImage(imageId: string): void {
  window.location.href = imageUrl(imageId);
}

/**
 * The image to go to, null when there is none, or undefined when the server
 * could not be asked (already reported to the user).
 */
async function findTarget(direction: 'next' | 'prev'): Promise<string | null | undefined> {
  const { currentImageId, images } = store();
  if (!currentImageId) return null;
  if (direction === 'prev') {
    const cameFrom = stepBack(currentImageId);
    return cameFrom && images.some(i => i.image_id === cameFrom)
      ? cameFrom
      : store().getPrevImageId();
  }
  try {
    const target = await getNextImageId(currentImageId);
    if (target) recordStep(currentImageId, target);
    return target;
  } catch (error) {
    store().showErrorModal(error instanceof AuthError
      ? 'Your session has expired; log in again to continue.'
      : 'Could not find the next image.');
    return undefined;
  }
}

/**
 * Enter and Backspace: save, then open the next or previous image.
 * Saves even when nothing changed, as before.
 */
export async function saveThenGo(direction: 'next' | 'prev'): Promise<void> {
  try {
    await store().saveCurrentMask();
  } catch {
    return; // the store has reported the failure
  }
  const target = await findTarget(direction);
  if (target === undefined) return;
  if (!target) {
    store().showNotice('No other images');
    return;
  }
  if (store().showDialogueBeforeNextImage) {
    await askForActionInfo(target);
  } else {
    goToImage(target);
  }
}

/** Previous/next buttons in the top bar: save only if there are changes. */
export async function goFromToolbar(direction: 'next' | 'prev'): Promise<void> {
  if (store().maskChanged) {
    try {
      await store().saveCurrentMask();
    } catch {
      return;
    }
  }
  const target = await findTarget(direction);
  if (target === undefined) return;
  if (target) goToImage(target);
}

/**
 * Picking an image from the list: with unsaved changes, first ask for the
 * action info (difficulty, notes, complete); otherwise go straight there.
 */
export async function goToPickedImage(imageId: string): Promise<void> {
  if (store().maskChanged) {
    await askForActionInfo(imageId);
  } else {
    goToImage(imageId);
  }
}

/** Show the "Before you continue..." prompt, then go to `targetImageId`. */
export async function askForActionInfo(targetImageId: string): Promise<void> {
  const { currentImageId, showDialogueBeforeNextImage } = store();
  if (!showDialogueBeforeNextImage || !currentImageId) return;

  store().setLoadingMessage('Making some checks...');
  const action = await getActionInfo(currentImageId).catch(() => null);
  store().setLoadingMessage(null);

  if (!action) {
    // No saved action to annotate yet: continue without the prompt
    store().setShowDialogueBeforeNextImage(false);
    goToImage(targetImageId);
    return;
  }
  store().openActionInfoPrompt(action, targetImageId);
}
