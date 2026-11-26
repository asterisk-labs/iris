/**
 * The segmentation page's store: one Zustand store assembled from slices.
 * Slices are spread flat, so state is read as `useSegmentationStore(s => s.showMask)`.
 *
 * Components read through narrow selectors. Actions that change several
 * slices at once (load, save, predict) are defined here.
 */

import { create } from 'zustand';
import { paintedPixels, usableClasses, MIN_CLASSES } from '../../segmentation/ai/sampling';
import { toConfusionMatrix } from '../../segmentation/ai/metrics';
import { loadMask, saveMask } from '../../services/masks';
import { NO_LABEL } from '../../segmentation/mask/MaskDocument';
import { predictMask as requestPrediction } from '../../services/prediction';
import { AuthError, HttpError } from '../../services/http';
import { createConfigSlice } from './configSlice';
import { createMaskSlice } from './maskSlice';
import { createToolSlice } from './toolSlice';
import { createFilterSlice } from './filterSlice';
import { createNavigationSlice } from './navigationSlice';
import { createViewSlice } from './viewSlice';
import { createUiSlice } from './uiSlice';
import type { MaskIoActions, SegmentationState, SliceCreator } from './types';

export * from './types';

/** The server's message, or only the status when it answered with an HTML error page */
const describeError = (error: unknown) => {
  if (!(error instanceof HttpError)) return String(error);
  return /^\s*</.test(error.body) ? `Server error (${error.status})` : error.body;
};

const createMaskIoActions: SliceCreator<MaskIoActions> = (set, get) => ({
  loadMaskForImage: async (imageId) => {
    if (get().isLoading) return;
    const dims = get().maskDimensions;
    if (!dims) {
      get().showErrorModal('Could not load mask: mask dimensions not available');
      return;
    }

    set({ isLoading: true });
    get().setLoadingMessage('Loading masks...');
    try {
      const n = dims.width * dims.height;
      let masks: { final: Uint8Array; user: Uint8Array } | null;
      try {
        masks = await loadMask(imageId, n);
      } catch (error) {
        if (error instanceof AuthError) get().requestLogin();
        else get().showErrorModal(`Could not load the mask from the server!\n${describeError(error)}`);
        return;
      }
      get().setCurrentImage(imageId);
      get().setMasks(masks ? masks.final : new Uint8Array(n).fill(NO_LABEL), masks ? masks.user : new Uint8Array(n));
      get().maskHistory.clear();
      get().recordHistory();
      get().setMaskChanged(false);
    } finally {
      set({ isLoading: false });
      get().setLoadingMessage(null);
    }
  },

  saveCurrentMask: async () => {
    const { currentImageId, isLoading, maskDocument: doc } = get();
    // Nothing to save until a mask has been loaded
    if (isLoading || !currentImageId || !doc) return;

    set({ isLoading: true });
    get().showNotice('Saving mask...');
    try {
      await saveMask(currentImageId, doc.final, doc.user);
      get().showNotice('Mask saved', 1000);
      get().setMaskChanged(false);
      set({ maskSavedAt: Date.now() });
    } catch (error) {
      get().hideNotice();
      if (error instanceof AuthError) get().requestLogin();
      else get().showErrorModal(`Could not save the mask due to an internal problem!\n${describeError(error)}`);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  predictMask: async () => {
    const { isLoading, userPixelCounts, maskDocument: doc, currentImageId, config, classes } = get();
    if (isLoading) return;
    if (usableClasses(userPixelCounts).length < MIN_CLASSES) {
      throw new Error('You need to draw at least 10 pixels for more than one class to use the AI.');
    }
    if (!doc || !currentImageId || !config?.segmentation?.ai_model) return;

    set({ isLoading: true });
    get().setLoadingMessage('Train AI...');
    try {
      const { pixels, labels } = paintedPixels(doc.final, doc.user);
      let result;
      try {
        result = await requestPrediction(currentImageId, pixels, labels);
      } catch (error) {
        if (error instanceof AuthError) get().requestLogin();
        else if (error instanceof HttpError && error.status === 400) get().showErrorModal(error.body);
        else get().showErrorModal('Could not predict the mask due to a server problem!');
        return;
      }
      if (result.mask.length !== doc.length || result.errors.length !== doc.length) {
        get().showErrorModal('Could not predict the mask: the server returned the wrong number of pixels.');
        return;
      }

      get().setLoadingMessage('Process results...');
      doc.setErrors(result.errors);
      doc.applyPrediction(result.mask);
      set({
        maskRevision: doc.revision,
        predictionRevision: doc.revision,
        userPixelCounts: doc.counts(),
        confusionMatrix: toConfusionMatrix(result, classes.map(c => c.name)),
      });
      get().recordHistory();
      get().setMaskChanged(true);
    } finally {
      set({ isLoading: false });
      get().setLoadingMessage(null);
    }
  },
});

export const useSegmentationStore = create<SegmentationState>()((...a) => ({
  ...createConfigSlice(...a),
  ...createMaskSlice(...a),
  ...createToolSlice(...a),
  ...createFilterSlice(...a),
  ...createNavigationSlice(...a),
  ...createViewSlice(...a),
  ...createUiSlice(...a),
  ...createMaskIoActions(...a),
}));
