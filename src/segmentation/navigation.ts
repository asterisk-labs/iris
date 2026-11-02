/**
 * Moving between images. Each image is its own page load
 * (/segmentation/?image_id=...); unsaved changes are saved first or, on
 * page hide, by the beacon in segmentation-app.
 */

import { useSegmentationStore } from '../stores/segmentationStore';
import { imageUrl } from '../services/http';
import { getActionInfo } from '../services/actionInfo';

const store = () => useSegmentationStore.getState();

export { imageUrl };

export function goToImage(imageId: string): void {
  window.location.href = imageUrl(imageId);
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
  const target = direction === 'next' ? store().getNextImageId() : store().getPrevImageId();
  if (!target) {
    store().showNotice(direction === 'next' ? 'No more images' : 'Already at first image');
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
  const target = direction === 'next' ? store().getNextImageId() : store().getPrevImageId();
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
