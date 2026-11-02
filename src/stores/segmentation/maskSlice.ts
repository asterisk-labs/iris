import { MaskDocument } from '../../segmentation/mask/MaskDocument';
import { MaskHistory } from '../../segmentation/mask/history';
import type { MaskSlice, SegmentationState, SliceCreator } from './types';

/** The mask document for the current mask size, created or replaced as needed. */
function ensureDocument(get: () => SegmentationState, set: (partial: Partial<SegmentationState>) => void): MaskDocument | null {
  const { maskDocument, maskDimensions, classes } = get();
  if (!maskDimensions) return null;
  if (maskDocument && maskDocument.width === maskDimensions.width && maskDocument.height === maskDimensions.height) {
    return maskDocument;
  }
  const doc = new MaskDocument(maskDimensions.width, maskDimensions.height, Math.max(classes.length, 1));
  set({ maskDocument: doc });
  return doc;
}

export const createMaskSlice: SliceCreator<MaskSlice> = (set, get) => {
  /** Publish the document's current state after a change. */
  const changed = (doc: MaskDocument) => set({ maskRevision: doc.revision, userPixelCounts: doc.counts() });
  const historyFlags = () => {
    const h = get().maskHistory;
    set({ canUndo: h.canUndo(), canRedo: h.canRedo() });
  };

  return {
    maskDocument: null,
    maskRevision: 0,
    predictionRevision: null,
    userPixelCounts: { total: 0 },
    maskHistory: new MaskHistory(),
    canUndo: false,
    canRedo: false,
    maskChanged: false,
    maskType: 'final',
    showMask: true,
    confusionMatrix: null,

    setMasks: (final, user) => {
      const doc = ensureDocument(get, set);
      if (!doc) {
        console.error('[IRIS] setMasks: No mask dimensions set');
        return;
      }
      doc.replace(final, user);
      doc.setErrors(new Uint8Array(doc.length));
      set({ confusionMatrix: null, predictionRevision: null });
      changed(doc);
    },

    clearMask: () => {
      get().maskHistory.clear();
      set({
        maskDocument: null,
        maskRevision: 0,
        predictionRevision: null,
        userPixelCounts: { total: 0 },
        confusionMatrix: null,
        canUndo: false,
        canRedo: false,
      });
    },

    paintPixels: (indices, classId) => {
      const doc = get().maskDocument;
      if (!doc) return;
      if (classId === null) doc.erase(indices);
      else doc.paint(indices, classId);
      changed(doc);
      get().maskHistory.discardFuture();
      historyFlags();
      get().setMaskChanged(true);
    },

    recordHistory: () => {
      const doc = get().maskDocument;
      if (!doc) return;
      get().maskHistory.record(doc.snapshot());
      historyFlags();
    },

    undo: () => {
      const doc = get().maskDocument;
      const state = get().maskHistory.undo();
      if (!doc || !state) return;
      doc.replace(state.final, state.user);
      changed(doc);
      historyFlags();
      get().setMaskChanged(true);
    },

    redo: () => {
      const doc = get().maskDocument;
      const state = get().maskHistory.redo();
      if (!doc || !state) return;
      doc.replace(state.final, state.user);
      changed(doc);
      historyFlags();
      get().setMaskChanged(true);
    },

    resetMask: () => {
      const doc = get().maskDocument;
      if (!doc) return;
      doc.reset();
      changed(doc);
      // Unlike before the migration, a reset can be undone
      get().recordHistory();
      get().setMaskChanged(true);
    },

    setMaskChanged: (maskChanged) => {
      set({ maskChanged });
      get().setShowDialogueBeforeNextImage(maskChanged);
    },

    setMaskType: (maskType) => set({ maskType }),
    setShowMask: (showMask) => set({ showMask }),
    toggleMask: () => set({ showMask: !get().showMask }),
  };
};
