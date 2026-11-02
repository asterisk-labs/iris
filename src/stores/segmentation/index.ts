/**
 * The segmentation page's store: one Zustand store assembled from slices.
 * Slices are spread flat, so state is read as `useSegmentationStore(s => s.showMask)`.
 *
 * Components read through narrow selectors. Actions that change several
 * slices at once (load, save, predict) are defined here.
 */

import { create } from 'zustand';
import { splitTrainTest, usableClasses, MIN_CLASSES } from '../../segmentation/ai/sampling';
import { scorePrediction } from '../../segmentation/ai/metrics';
import { loadMask, saveMask } from '../../services/masks';
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

const describeError = (error: unknown) => (error instanceof HttpError ? error.body : String(error));

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
      get().setMasks(masks ? masks.final : new Uint8Array(n), masks ? masks.user : new Uint8Array(n));
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
    const aiModel = config?.segmentation?.ai_model;
    if (!doc || !currentImageId || !aiModel) return;

    set({ isLoading: true });
    get().setLoadingMessage('Prepare training data...');
    try {
      const split = splitTrainTest(doc.final, doc.user, userPixelCounts, {
        trainRatio: aiModel.train_ratio,
        maxTrainPixels: aiModel.max_train_pixels,
      });

      get().setLoadingMessage('Train AI...');
      let predicted: Uint8Array;
      try {
        predicted = await requestPrediction(currentImageId, split.trainPixels, split.trainLabels);
      } catch (error) {
        if (error instanceof AuthError) get().requestLogin();
        else get().showErrorModal('Could not predict the mask due to a server problem!');
        return;
      }
      if (predicted.length !== doc.length) {
        get().showErrorModal('Could not predict the mask: the server returned the wrong number of pixels.');
        return;
      }

      get().setLoadingMessage('Process results...');
      const { errors, confusionMatrix } = scorePrediction(predicted, split, classes.map(c => c.name));
      doc.setErrors(errors);
      doc.applyPrediction(predicted);
      set({
        maskRevision: doc.revision,
        predictionRevision: doc.revision,
        userPixelCounts: doc.counts(),
        confusionMatrix,
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
