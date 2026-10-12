/**
 * Segmentation Store (Zustand)
 * 
 * This store gradually replaces the global `vars` object from legacy JavaScript.
 * 
 * Migration Status:
 * - [x] showMask (vars.show_mask) - COMPLETE
 * - [x] showDialogueBeforeNextImage (vars.show_dialogue_before_next_image) - COMPLETE
 * - [x] Image Navigation (centralized image list and navigation) - COMPLETE
 * - [x] Image Filters (vars.vm.filters) - COMPLETE
 * - [x] API URLs (vars.url) - COMPLETE
 * - [x] Next Action (vars.next_action) - COMPLETE
 * - [x] Just Logged In (vars.just_logged_in) - COMPLETE
 * - [x] Core Drawing State (vars.tool, vars.current_class, vars.mask_type, vars.classes) - COMPLETE
 * - [x] Mask Data (vars.mask, vars.user_mask, vars.errors_mask) - COMPLETE
 * - [x] Mask Shape (vars.mask_shape) - COMPLETE
 * - [x] Config (vars.config) - COMPLETE
 * - [x] User (vars.user) - COMPLETE
 * - [x] Confusion Matrix (vars.confusion_matrix) - COMPLETE
 */

import { create } from 'zustand';
import type { 
  ProjectConfig, 
  ClassConfig, 
  UserInfo, 
  ConfusionMatrix
} from '../types/iris';
import { MaskDocument } from '../segmentation/mask/MaskDocument';
import { useViewManagerStore } from './viewManagerStore';
import { splitTrainTest, usableClasses, MIN_CLASSES } from '../segmentation/ai/sampling';
import { scorePrediction } from '../segmentation/ai/metrics';
import { loadMask, saveMask } from '../services/masks';
import { predictMask as requestPrediction } from '../services/prediction';
import { AuthError, HttpError, setAppUrls } from '../services/http';
import type { ActionInfo } from '../services/actionInfo';

interface ImageInfo {
  image_id: string;
  has_user_annotation: boolean;
  has_any_annotation: boolean;
  annotation_count: number;
}

interface ApiUrls {
  main: string;
  segmentation: string;
  user: string;
  admin: string;
}

interface SegmentationDebugInfo {
  showMask: boolean;
  currentImageId: string | null;
  imagesCount: number;
  filtersActive: boolean;
  brightness: number;
  saturation: number;
  contrast: boolean;
  invert: boolean;
  // Core drawing state debug info
  currentTool: string;
  toolSize: number;
  currentClass: number;
  maskType: string;
  classesCount: number;
  totalUserPixels: number;
  // PHASE 2: Navigation & Actions debug info
  hasConfig: boolean;
  hasUser: boolean;
  hasConfusionMatrix: boolean;
  maskChanged: boolean;
  isLoading: boolean;
  lastSaveTime: string | null;
  // API URLs debug info
  hasApiUrls: boolean;
}

interface SegmentationState {
  // Mask Visibility
  showMask: boolean;
  setShowMask: (visible: boolean) => void;
  toggleMask: () => void;

  // Navigation Confirmation Dialog
  showDialogueBeforeNextImage: boolean;
  setShowDialogueBeforeNextImage: (show: boolean) => void;



  // CRITICAL: API URLs (replaces vars.url)
  apiUrls: ApiUrls | null;
  setApiUrls: (urls: ApiUrls) => void;
  getApiUrl: (endpoint: keyof ApiUrls) => string | null;

  // The mask being edited. maskData/userMaskData/errorsMaskData are its arrays
  // (live, mutated in place); maskRevision changes whenever the mask does.
  maskDocument: MaskDocument | null;
  maskRevision: number;
  maskData: Uint8Array | null;
  userMaskData: Uint8Array | null;
  errorsMaskData: Uint8Array | null;
  maskDimensions: { width: number; height: number } | null;
  
  // Mask Data Actions
  setMaskData: (data: Uint8Array, width: number, height: number) => void;
  setUserMaskData: (data: Uint8Array) => void;
  setErrorsMaskData: (data: Uint8Array) => void;
  clearMask: () => void;
  /** Paint pixels (mask indices) with a class, or erase them when classId is null. */
  paintPixels: (indices: number[], classId: number | null) => void;
  copyMask: () => Uint8Array | null;
  copyUserMask: () => Uint8Array | null;
  
  // Mask Shape Actions (replaces vars.mask_shape)
  setMaskDimensions: (dimensions: { width: number; height: number }) => void;
  getMaskShape: () => [number, number] | null;
  
  // History System (replaces vars.history)
  maskHistory: Uint8Array[];
  userMaskHistory: Uint8Array[];
  historyCurrentEpoch: number;
  historyMaxEpochs: number;
  
  // Debounced History State
  historyDebounceMs: number;
  historyDebounceTimer: NodeJS.Timeout | null;
  hasPendingHistoryUpdate: boolean;
  
  // History Actions
  updateHistory: () => void;
  scheduleHistoryUpdate: () => void;
  flushPendingHistory: () => void;
  undo: () => void;
  redo: () => void;
  discardFuture: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  
  // Page-level feedback: a blocking loading message, a transient notice,
  // and a request for the login form (session expired)
  loadingMessage: string | null;
  notice: { text: string; key?: string; id: number } | null;
  loginRequired: boolean;
  /** Asking for difficulty/notes/complete before going to targetImageId. */
  actionInfoPrompt: { action: ActionInfo; targetImageId: string } | null;
  resetMaskConfirmOpen: boolean;
  setLoadingMessage: (text: string | null) => void;
  showNotice: (text: string, timeoutMs?: number, key?: string) => void;
  openActionInfoPrompt: (action: ActionInfo, targetImageId: string) => void;
  closeActionInfoPrompt: () => void;
  requestResetMask: () => void;
  closeResetMaskConfirm: () => void;
  hideNotice: () => void;
  requestLogin: () => void;
  clearLoginRequest: () => void;

  /** maskRevision right after the last prediction; the score describes the mask while they match. */
  predictionRevision: number | null;
  resetMask: () => void;

  // Error Modal
  errorModal: {
    isOpen: boolean;
    title: string;
    message: string;
  };
  showErrorModal: (message: string, title?: string) => void;
  hideErrorModal: () => void;
  
  // Debug state
  debugMode: boolean;

  // Mask Area (replaces vars.mask_area)
  maskArea: [number, number, number, number] | null;
  setMaskArea: (area: [number, number, number, number] | null) => void;
  getMaskArea: () => [number, number, number, number] | null;

  // Image Navigation
  images: ImageInfo[];
  currentImageId: string | null;
  currentImageIndex: number;
  
  // Navigation Actions
  setImages: (images: ImageInfo[]) => void;
  setCurrentImage: (imageId: string) => void;
  navigateNext: () => string | null;
  navigatePrev: () => string | null;
  navigateToImage: (imageId: string) => void;
  
  // Navigation Getters
  getNextImageId: () => string | null;
  getPrevImageId: () => string | null;
  getCurrentImage: () => ImageInfo | null;

  // Image Filters (replaces vars.vm.filters)
  brightness: number;
  saturation: number;
  contrast: boolean;
  invert: boolean;
  
  // Filter UI State
  expandedFilterSlider: string | null; // Track which slider is currently expanded
  
  // Filter Actions
  setBrightness: (value: number) => void;
  setSaturation: (value: number) => void;
  setContrast: (enabled: boolean) => void;
  setInvert: (enabled: boolean) => void;
  resetFilters: () => void;
  changeBrightness: (up: boolean) => void;
  changeSaturation: (up: boolean) => void;
  setExpandedFilterSlider: (sliderId: string | null) => void;
  
  // PHASE 1: Core Drawing State (replaces vars.tool, vars.current_class, vars.mask_type, vars.classes)
  currentTool: 'move' | 'draw' | 'eraser';
  toolSize: number;
  toolShape: 'square' | 'round';
  showDrawToolDropdown: boolean;
  showEraserToolDropdown: boolean;
  currentClass: number;
  maskType: 'final' | 'user' | 'errors';
  classes: ClassConfig[];
  userPixelCounts: { [classId: number]: number; total: number };
  
  // PHASE 1: Core Drawing Actions
  setCurrentTool: (tool: 'move' | 'draw' | 'eraser') => void;
  setToolSize: (size: number) => void;
  setToolShape: (shape: 'square' | 'round') => void;
  setShowDrawToolDropdown: (show: boolean) => void;
  setShowEraserToolDropdown: (show: boolean) => void;
  setCurrentClass: (classId: number) => void;
  setMaskType: (type: 'final' | 'user' | 'errors') => void;
  setClasses: (classes: ClassConfig[]) => void;
  updateUserPixelCounts: (counts: { [classId: number]: number; total: number }) => void;
  calculatePixelCounts: () => { [classId: number]: number; total: number };
  
  // User Pixel Counts Helper Methods (NEW - vars.n_user_pixels migration)
  validateAITrainingData: () => {
    isValid: boolean;
    classesWithEnoughPixels: number;
    totalPixels: number;
    classPixelCounts: { [classId: number]: number };
    minPixelsRequired: number;
    minClassesRequired: number;
  };
  getClassPixelCount: (classId: number) => number;
  getTotalUserPixels: () => number;
  recalculatePixelCounts: () => { [classId: number]: number; total: number };
  
  // PHASE 2: Navigation & Actions State (replaces vars.config, vars.user, vars.confusion_matrix)
  config: ProjectConfig | null;
  user: UserInfo | null;
  confusionMatrix: ConfusionMatrix | null;
  maskChanged: boolean;
  isLoading: boolean;
  lastSaveTime: Date | null;
  
  // PHASE 2: Navigation & Actions Actions
  saveCurrentMask: () => Promise<void>;
  loadMaskForImage: (imageId: string) => Promise<void>;
  predictMask: () => Promise<void>;
  updateConfusionMatrix: (matrix: ConfusionMatrix) => void;
  clearConfusionMatrix: () => void;
  getAccuracyStats: () => ConfusionMatrix['accuracyStats'] | null;
  getConfusionMatrixData: () => number[][] | null;
  createConfusionMatrix: (
    matrix: number[][], 
    truePositives: { [classId: number]: number },
    userClasses: number[],
    classNames: string[]
  ) => ConfusionMatrix;
  resetViews: () => void;
  setConfig: (config: ProjectConfig) => void;
  setUser: (user: UserInfo) => void;
  setMaskChanged: (changed: boolean) => void;
  
  // Config Helper Methods
  getConfigSection: <T extends keyof ProjectConfig>(section: T) => ProjectConfig[T] | null;
  updateConfigSection: <T extends keyof ProjectConfig>(section: T, data: ProjectConfig[T]) => void;
  validateConfig: (config: ProjectConfig) => boolean;
  getConfigDebugInfo: () => { loaded: boolean; sections: string[]; valid: boolean; hasClasses: number; hasViews: number; hasViewGroups: number; hasSegmentation: boolean; hasAIModel: boolean };
  
  // Debug actions
  setDebugMode: (enabled: boolean) => void;
  getDebugInfo: () => SegmentationDebugInfo;
}

/** The current mask document, replaced when the mask size changes. */
const ensureMaskDocument = (width: number, height: number): MaskDocument => {
  const { maskDocument, classes } = useSegmentationStore.getState();
  if (maskDocument && maskDocument.width === width && maskDocument.height === height) {
    return maskDocument;
  }
  const doc = new MaskDocument(width, height, Math.max(classes.length, 1));
  useSegmentationStore.setState({ maskDocument: doc, userMaskData: null, errorsMaskData: null });
  return doc;
};

export const useSegmentationStore = create<SegmentationState>((set, get) => ({
  // Mask Visibility State
  showMask: true,
  
  setShowMask: (visible: boolean) => {
    set({ showMask: visible });
  },
  
  toggleMask: () => {
    set((state) => ({ showMask: !state.showMask }));
  },

  // Navigation Confirmation Dialog State
  showDialogueBeforeNextImage: false,
  
  setShowDialogueBeforeNextImage: (show: boolean) => {
    set({ showDialogueBeforeNextImage: show });
  },



  // CRITICAL: API URLs State (replaces vars.url)
  apiUrls: null,

  setApiUrls: (urls: ApiUrls) => {
    // Validate input
    if (!urls || typeof urls !== 'object') {
      console.error('[IRIS] setApiUrls: Invalid URLs object', urls);
      return;
    }

    // Validate required endpoints
    const requiredEndpoints: (keyof ApiUrls)[] = ['main', 'segmentation', 'user', 'admin'];
    const missingEndpoints = requiredEndpoints.filter(endpoint => !urls[endpoint] || typeof urls[endpoint] !== 'string' || urls[endpoint].trim() === '');
    
    if (missingEndpoints.length > 0) {
      console.error('[IRIS] setApiUrls: Missing or invalid endpoints', missingEndpoints);
      return;
    }

    set({ apiUrls: urls });
    setAppUrls(urls);
  },

  getApiUrl: (endpoint: keyof ApiUrls) => {
    const { apiUrls } = get();
    if (!apiUrls) {
      console.warn(`[IRIS] getApiUrl: No API URLs available for endpoint '${endpoint}'`);
      return null;
    }
    
    if (!apiUrls[endpoint]) {
      console.warn(`[IRIS] getApiUrl: Endpoint '${endpoint}' not found in API URLs`);
      return null;
    }
    
    return apiUrls[endpoint];
  },

  // CRITICAL: Core Mask Data State (replaces vars.mask, vars.user_mask, vars.errors_mask)
  maskDocument: null,
  maskRevision: 0,
  maskData: null,
  userMaskData: null,
  errorsMaskData: null,
  maskDimensions: null,

  // History System State (replaces vars.history)
  maskHistory: [],
  userMaskHistory: [],
  historyCurrentEpoch: 0,
  historyMaxEpochs: 30,
  
  // Debounced History State
  historyDebounceMs: 375,
  historyDebounceTimer: null,
  hasPendingHistoryUpdate: false,

  setMaskData: (data: Uint8Array, width: number, height: number) => {
    if (!(data instanceof Uint8Array)) {
      console.error('[IRIS] setMaskData: Invalid data type, expected Uint8Array');
      return;
    }
    if (width <= 0 || height <= 0) {
      console.error('[IRIS] setMaskData: Invalid dimensions', { width, height });
      return;
    }
    if (data.length !== width * height) {
      console.error('[IRIS] setMaskData: Data length mismatch', {
        dataLength: data.length,
        expectedLength: width * height
      });
      return;
    }

    const doc = ensureMaskDocument(width, height);
    doc.replace(data, doc.user);
    set({
      maskData: doc.final,
      maskDimensions: { width, height },
      maskRevision: doc.revision,
    });

    const { classes } = get();
    if (classes && classes.length > 0) {
      get().updateUserPixelCounts(get().calculatePixelCounts());
    }
  },

  setUserMaskData: (data: Uint8Array) => {
    const { maskDimensions } = get();
    if (!maskDimensions) {
      console.error('[IRIS] setUserMaskData: No mask dimensions set');
      return;
    }
    if (!(data instanceof Uint8Array)) {
      console.error('[IRIS] setUserMaskData: Invalid data type, expected Uint8Array');
      return;
    }
    if (data.length !== maskDimensions.width * maskDimensions.height) {
      console.error('[IRIS] setUserMaskData: Data length mismatch');
      return;
    }

    const doc = ensureMaskDocument(maskDimensions.width, maskDimensions.height);
    doc.replace(doc.final, data);
    set({ userMaskData: doc.user, maskRevision: doc.revision });

    const { classes } = get();
    if (classes && classes.length > 0) {
      get().updateUserPixelCounts(get().calculatePixelCounts());
    }
  },

  setErrorsMaskData: (data: Uint8Array) => {
    const { maskDimensions } = get();
    if (!maskDimensions) {
      console.error('[IRIS] setErrorsMaskData: No mask dimensions set');
      return;
    }
    if (!(data instanceof Uint8Array)) {
      console.error('[IRIS] setErrorsMaskData: Invalid data type, expected Uint8Array');
      return;
    }
    if (data.length !== maskDimensions.width * maskDimensions.height) {
      console.error('[IRIS] setErrorsMaskData: Data length mismatch');
      return;
    }

    const doc = ensureMaskDocument(maskDimensions.width, maskDimensions.height);
    doc.setErrors(data);
    set({ errorsMaskData: doc.errors, maskRevision: doc.revision });
  },

  paintPixels: (indices: number[], classId: number | null) => {
    const doc = get().maskDocument;
    if (!doc) return;
    if (classId === null) doc.erase(indices);
    else doc.paint(indices, classId);
    set({ maskRevision: doc.revision });
    get().updateUserPixelCounts(doc.counts());
    get().discardFuture();
    get().setMaskChanged(true);
  },

  clearMask: () => {
    set({ 
      maskDocument: null,
      maskData: null,
      userMaskData: null,
      errorsMaskData: null,
      maskDimensions: null,
      maskHistory: [],
      userMaskHistory: [],
      historyCurrentEpoch: 0,
      userPixelCounts: { total: 0 } // Reset pixel counts when clearing mask
    });
  },

  getMaskShape: () => {
    const { maskDimensions } = get();
    return maskDimensions ? [maskDimensions.width, maskDimensions.height] : null;
  },

  setMaskDimensions: (dimensions: { width: number; height: number }) => {
    // Validate input
    if (!dimensions || typeof dimensions !== 'object') {
      console.error('[IRIS] setMaskDimensions: Invalid dimensions object', dimensions);
      return;
    }
    
    const { width, height } = dimensions;
    
    if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) {
      console.error('[IRIS] setMaskDimensions: Invalid dimensions', { width, height });
      return;
    }

    // If we have existing mask data, validate dimensions match
    const currentMask = get().maskData;
    if (currentMask && currentMask.length !== width * height) {
      console.warn('[IRIS] setMaskDimensions: Dimension mismatch with existing mask data', {
        currentLength: currentMask.length,
        expectedLength: width * height
      });
    }

    // Update dimensions
    set({ maskDimensions: { width, height } });
  },

  copyMask: () => {
    const { maskData } = get();
    if (!maskData) return null;
    return new Uint8Array(maskData);
  },

  copyUserMask: () => {
    const { userMaskData } = get();
    if (!userMaskData) return null;
    return new Uint8Array(userMaskData);
  },

  // History System Actions (replaces vars.history)
  updateHistory: () => {
    const { 
      maskData, 
      userMaskData, 
      maskHistory, 
      userMaskHistory, 
      historyCurrentEpoch, 
      historyMaxEpochs 
    } = get();
    
    if (!maskData || !userMaskData) return;

    // Create copies for history
    const maskCopy = new Uint8Array(maskData);
    const userMaskCopy = new Uint8Array(userMaskData);

    // Remove future history if we're not at the end
    const newMaskHistory = maskHistory.slice(0, historyCurrentEpoch + 1);
    const newUserMaskHistory = userMaskHistory.slice(0, historyCurrentEpoch + 1);

    // Add current state to history
    newMaskHistory.push(maskCopy);
    newUserMaskHistory.push(userMaskCopy);

    // Calculate new epoch (points to the newly added entry)
    let newEpoch = newMaskHistory.length - 1;

    // Limit history size
    if (newMaskHistory.length > historyMaxEpochs) {
      newMaskHistory.shift();
      newUserMaskHistory.shift();
      newEpoch = newMaskHistory.length - 1; // Adjust epoch after removing first element
    }

    set({
      maskHistory: newMaskHistory,
      userMaskHistory: newUserMaskHistory,
      historyCurrentEpoch: newEpoch
    });
  },

  scheduleHistoryUpdate: () => {
    const { historyDebounceTimer, historyDebounceMs } = get();
    
    // Clear existing timer
    if (historyDebounceTimer) {
      clearTimeout(historyDebounceTimer);
    }
    
    // Set pending flag
    set({ hasPendingHistoryUpdate: true });
    
    // Schedule new update
    const newTimer = setTimeout(() => {
      get().updateHistory();
      // Always clear the pending flag, even if updateHistory returned early
      set({ 
        historyDebounceTimer: null, 
        hasPendingHistoryUpdate: false 
      });
    }, historyDebounceMs);
    
    set({ historyDebounceTimer: newTimer });
  },

  flushPendingHistory: () => {
    const { historyDebounceTimer, hasPendingHistoryUpdate } = get();
    
    if (historyDebounceTimer) {
      clearTimeout(historyDebounceTimer);
      set({ historyDebounceTimer: null });
    }
    
    if (hasPendingHistoryUpdate) {
      get().updateHistory();
      set({ hasPendingHistoryUpdate: false });
    }
  },

  discardFuture: () => {
    const { maskHistory, userMaskHistory, historyCurrentEpoch } = get();
    
    const newMaskHistory = maskHistory.slice(0, historyCurrentEpoch + 1);
    const newUserMaskHistory = userMaskHistory.slice(0, historyCurrentEpoch + 1);

    set({
      maskHistory: newMaskHistory,
      userMaskHistory: newUserMaskHistory
    });
  },

  undo: () => {
    // Discard any pending history updates (don't save them)
    const { historyDebounceTimer } = get();
    if (historyDebounceTimer) {
      clearTimeout(historyDebounceTimer);
      set({ 
        historyDebounceTimer: null, 
        hasPendingHistoryUpdate: false 
      });
    }
    
    const { maskHistory, userMaskHistory, historyCurrentEpoch, maskDimensions } = get();
    
    if (historyCurrentEpoch <= 0 || !maskDimensions) return;

    const newEpoch = historyCurrentEpoch - 1;
    const historicalMask = maskHistory[newEpoch];
    const historicalUserMask = userMaskHistory[newEpoch];

    const doc = get().maskDocument;
    if (historicalMask && historicalUserMask && doc) {
      doc.replace(historicalMask, historicalUserMask);
      set({
        maskData: doc.final,
        userMaskData: doc.user,
        historyCurrentEpoch: newEpoch,
        maskRevision: doc.revision,
      });

      // Update pixel counts (only if classes are set)
      const { classes } = get();
      if (classes && classes.length > 0) {
        get().updateUserPixelCounts(get().calculatePixelCounts());
      }
      get().setMaskChanged(true);
    }
  },

  redo: () => {
    const { maskHistory, userMaskHistory, historyCurrentEpoch, maskDimensions } = get();
    
    if (historyCurrentEpoch >= maskHistory.length - 1 || !maskDimensions) return;

    const newEpoch = historyCurrentEpoch + 1;
    const historicalMask = maskHistory[newEpoch];
    const historicalUserMask = userMaskHistory[newEpoch];

    const doc = get().maskDocument;
    if (historicalMask && historicalUserMask && doc) {
      doc.replace(historicalMask, historicalUserMask);
      set({
        maskData: doc.final,
        userMaskData: doc.user,
        historyCurrentEpoch: newEpoch,
        maskRevision: doc.revision,
      });

      // Update pixel counts (only if classes are set)
      const { classes } = get();
      if (classes && classes.length > 0) {
        get().updateUserPixelCounts(get().calculatePixelCounts());
      }
      get().setMaskChanged(true);
    }
  },

  canUndo: () => {
    const { maskHistory, historyCurrentEpoch } = get();
    return maskHistory.length > 1 && historyCurrentEpoch > 0;
  },

  canRedo: () => {
    const { maskHistory, historyCurrentEpoch } = get();
    return historyCurrentEpoch < maskHistory.length - 1;
  },

  loadingMessage: null,
  notice: null,
  loginRequired: false,
  actionInfoPrompt: null,
  resetMaskConfirmOpen: false,
  predictionRevision: null,

  setLoadingMessage: (text) => set({ loadingMessage: text }),

  showNotice: (text, timeoutMs, key) => {
    const id = Date.now() + Math.random();
    set({ notice: { text, key, id } });
    if (timeoutMs !== undefined) {
      setTimeout(() => {
        if (get().notice?.id === id) set({ notice: null });
      }, timeoutMs);
    }
  },

  hideNotice: () => set({ notice: null }),

  openActionInfoPrompt: (action, targetImageId) => set({ actionInfoPrompt: { action, targetImageId } }),

  closeActionInfoPrompt: () => set({ actionInfoPrompt: null }),

  requestResetMask: () => set({ resetMaskConfirmOpen: true }),

  closeResetMaskConfirm: () => set({ resetMaskConfirmOpen: false }),

  requestLogin: () => set({ loginRequired: true, loadingMessage: null }),

  clearLoginRequest: () => set({ loginRequired: false }),

  // Error Modal State
  errorModal: {
    isOpen: false,
    title: 'Error',
    message: '',
  },

  showErrorModal: (message: string, title = 'Error') => {
    console.log('[IRIS] showErrorModal called:', { message, title });
    set({
      errorModal: {
        isOpen: true,
        title,
        message,
      },
    });
  },

  hideErrorModal: () => {
    set({
      errorModal: {
        isOpen: false,
        title: 'Error',
        message: '',
      },
    });
  },

  // Image Filter State (replaces vars.vm.filters)
  brightness: 100,
  saturation: 100,
  contrast: false,
  invert: false,
  
  // Filter UI State
  expandedFilterSlider: null,
  
  // Debug state
  debugMode: false,

  // Mask Area State (replaces vars.mask_area)
  maskArea: null, // Default to no mask area

  // PHASE 1: Core Drawing State (replaces vars.tool, vars.current_class, vars.mask_type, vars.classes)
  currentTool: 'draw', // Default tool
  toolSize: 5, // Default tool size
  toolShape: 'square', // Default tool shape
  showDrawToolDropdown: false, // Default to dropdown closed
  showEraserToolDropdown: false, // Default to dropdown closed
  currentClass: 0, // Default to first class
  maskType: 'final', // Default mask type
  classes: [], // Will be initialized from legacy vars
  userPixelCounts: { total: 0 }, // Will be updated from legacy vars

  // PHASE 2: Navigation & Actions State (replaces vars.config, vars.user, vars.confusion_matrix)
  config: null, // Will be initialized from legacy vars
  user: null, // Will be initialized from legacy vars
  confusionMatrix: null, // Will be updated from AI predictions
  maskChanged: false, // Track unsaved changes
  isLoading: false, // Loading state for async operations
  lastSaveTime: null, // Track last save time

  setBrightness: (value: number) => {
    set({ brightness: Math.max(0, Math.min(800, value)) });
  },

  setSaturation: (value: number) => {
    set({ saturation: Math.max(0, Math.min(800, value)) });
  },

  setContrast: (enabled: boolean) => {
    set({ contrast: enabled });
  },

  setInvert: (enabled: boolean) => {
    set({ invert: enabled });
  },

  resetFilters: () => {
    set({
      brightness: 100,
      saturation: 100,
      contrast: false,
      invert: false
    });
  },

  changeBrightness: (up: boolean) => {
    const { brightness, setBrightness } = get();
    const newValue = up ? brightness + 10 : brightness - 10;
    setBrightness(newValue);
  },

  changeSaturation: (up: boolean) => {
    const { saturation, setSaturation } = get();
    const newValue = up ? saturation + 20 : saturation - 20;
    setSaturation(newValue);
  },

  setExpandedFilterSlider: (sliderId: string | null) => {
    set({ expandedFilterSlider: sliderId });
  },

  // Mask Area Actions (replaces vars.mask_area)
  setMaskArea: (area: [number, number, number, number] | null) => {
    // Validate input
    if (area !== null) {
      if (!Array.isArray(area) || area.length !== 4 || !area.every(coord => typeof coord === 'number' && !isNaN(coord))) {
        console.error('[IRIS] setMaskArea: Invalid mask area coordinates', area);
        return;
      }
    }

    set({ maskArea: area });
  },

  getMaskArea: () => {
    return get().maskArea;
  },

  // PHASE 1: Core Drawing Actions with Legacy Sync
  setCurrentTool: (tool: 'move' | 'draw' | 'eraser') => {
    // Validate tool type
    const validTools = ['move', 'draw', 'eraser'] as const;
    if (!validTools.includes(tool)) {
      console.warn('[IRIS] setCurrentTool: Invalid tool type provided', tool);
      return;
    }
    
    set({ currentTool: tool });
  },

  setToolSize: (size: number) => {
    const clampedSize = Math.max(1, Math.min(size, 100)); // Reasonable bounds: 1-100 pixels
    set({ toolSize: clampedSize });
  },


  setToolShape: (shape: 'square' | 'round') => {
    // Validate shape type
    const validShapes = ['square', 'round'] as const;
    if (!validShapes.includes(shape)) {
      console.warn('[IRIS] setToolShape: Invalid shape type provided', shape);
      return;
    }
    
    set({ toolShape: shape });
  },

  setShowDrawToolDropdown: (show: boolean) => {
    set({ showDrawToolDropdown: show });
  },

  setShowEraserToolDropdown: (show: boolean) => {
    set({ showEraserToolDropdown: show });
  },

  setCurrentClass: (classId: number) => {
    const { classes } = get();
    
    // Allow setting class even if no classes are loaded yet (for initialization)
    if (classes.length === 0) {
      console.log(`[IRIS] setCurrentClass: No classes available yet, setting class ${classId} for later validation`);
      set({ currentClass: classId });
      return;
    }
    
    if (classId < 0 || classId >= classes.length) {
      console.warn(`Invalid class ID: ${classId}, available classes: 0-${classes.length - 1}`);
      return;
    }
    
    set({ currentClass: classId });
    
    // Automatically switch to draw tool (legacy behavior)
    get().setCurrentTool('draw');
  },

  setMaskType: (type: 'final' | 'user' | 'errors') => {
    set({ maskType: type });
  },

  setClasses: (classes: ClassConfig[]) => {
    // Validate input
    if (!Array.isArray(classes)) {
      console.error('[IRIS] setClasses: Invalid classes array', classes);
      return;
    }

    // Validate each class has required properties
    const validClasses = classes.filter(cls => {
      // Check if name exists and is not empty
      if (!cls.name || cls.name.trim() === '') {
        console.warn('[IRIS] setClasses: Invalid class definition - missing or empty name', cls);
        return false;
      }
      
      // Check if colour exists and is a valid RGBA array
      if (!cls.colour || !Array.isArray(cls.colour) || cls.colour.length !== 4) {
        console.warn('[IRIS] setClasses: Invalid class definition - invalid colour array', cls);
        return false;
      }
      
      // Check if all colour values are numbers
      if (!cls.colour.every(val => typeof val === 'number' && val >= 0 && val <= 255)) {
        console.warn('[IRIS] setClasses: Invalid class definition - colour values must be numbers 0-255', cls);
        return false;
      }
      
      return true;
    });

    set({ classes: validClasses });
    get().maskDocument?.setClassCount(Math.max(validClasses.length, 1));

    // Update current class if it's now out of bounds
    const { currentClass } = get();
    if (currentClass >= validClasses.length) {
      get().setCurrentClass(0);
    }
  },

  updateUserPixelCounts: (counts: { [classId: number]: number; total: number }) => {
    set({ userPixelCounts: counts });
  },

  // Helper function to calculate pixel counts from mask data
  calculatePixelCounts: () => {
    const { maskData, userMaskData, classes } = get();
    if (!maskData || !userMaskData || !classes || classes.length === 0) {
      return { total: 0 };
    }

    const counts: { [classId: number]: number; total: number } = { total: 0 };
    
    // Initialize counts for all classes
    classes.forEach((_, index) => {
      counts[index] = 0;
    });

    // Count pixels where user has drawn (user_mask[i] == 1)
    // This matches the legacy logic: vars.n_user_pixels[maskData[i]] += 1
    for (let i = 0; i < userMaskData.length; i++) {
      if (userMaskData[i]) {
        const classId = maskData[i];
        // Ensure classId is valid before counting
        if (classId >= 0 && classId < classes.length) {
          counts[classId]++;
          counts.total++;
        }
      }
    }

    return counts;
  },

  // Validation method for AI training requirements
  validateAITrainingData: () => {
    const { userPixelCounts } = get();
    
    let classesWithEnoughPixels = 0;
    const classPixelCounts: { [classId: number]: number } = {};
    
    Object.keys(userPixelCounts).forEach(key => {
      if (key !== 'total') {
        const classId = parseInt(key);
        const pixelCount = userPixelCounts[classId];
        classPixelCounts[classId] = pixelCount;
        
        if (pixelCount > 10) {
          classesWithEnoughPixels++;
        }
      }
    });
    
    return {
      isValid: classesWithEnoughPixels >= 2,
      classesWithEnoughPixels,
      totalPixels: userPixelCounts.total,
      classPixelCounts,
      minPixelsRequired: 10,
      minClassesRequired: 2
    };
  },

  // Get pixel count for specific class
  getClassPixelCount: (classId: number) => {
    const { userPixelCounts } = get();
    return userPixelCounts[classId] || 0;
  },

  // Get total user pixels
  getTotalUserPixels: () => {
    const { userPixelCounts } = get();
    return userPixelCounts.total || 0;
  },

  // Recalculate pixel counts (useful for manual triggers)
  recalculatePixelCounts: () => {
    const newCounts = get().calculatePixelCounts();
    get().updateUserPixelCounts(newCounts);
    return newCounts;
  },

  // PHASE 2: Navigation & Actions Actions
  saveCurrentMask: async () => {
    const { currentImageId, isLoading, maskDocument: doc, userMaskData } = get();
    if (isLoading || !currentImageId) return;
    // Do not save masks that have not been loaded yet
    if (!doc || !userMaskData) return;

    set({ isLoading: true });
    get().showNotice('Saving mask...');
    try {
      await saveMask(currentImageId, doc.final, doc.user);
      get().showNotice('Mask saved', 1000);
      set({ lastSaveTime: new Date() });
      get().setMaskChanged(false);
    } catch (error) {
      get().hideNotice();
      if (error instanceof AuthError) {
        get().requestLogin();
      } else {
        const detail = error instanceof HttpError ? error.body : String(error);
        get().showErrorModal(`Could not save the mask due to an internal problem!\n${detail}`);
      }
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  loadMaskForImage: async (imageId: string) => {
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
        if (error instanceof AuthError) {
          get().requestLogin();
        } else {
          const detail = error instanceof HttpError ? error.body : String(error);
          get().showErrorModal(`Could not load the mask from the server!\n${detail}`);
        }
        return;
      }

      const doc = ensureMaskDocument(dims.width, dims.height);
      doc.replace(masks ? masks.final : new Uint8Array(n), masks ? masks.user : new Uint8Array(n));
      doc.setErrors(new Uint8Array(n));
      set({
        currentImageId: imageId,
        maskData: doc.final,
        userMaskData: doc.user,
        errorsMaskData: doc.errors,
        maskRevision: doc.revision,
        userPixelCounts: doc.counts(),
        confusionMatrix: null,
        predictionRevision: null,
      });
      get().discardFuture();
      get().updateHistory();
      get().setMaskChanged(false);
    } finally {
      set({ isLoading: false });
      get().setLoadingMessage(null);
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
      get().discardFuture();
      get().updateHistory();
      set({
        errorsMaskData: doc.errors,
        maskRevision: doc.revision,
        predictionRevision: doc.revision,
        userPixelCounts: doc.counts(),
        confusionMatrix,
      });
      get().setMaskChanged(true);
    } finally {
      set({ isLoading: false });
      get().setLoadingMessage(null);
    }
  },

  resetMask: () => {
    const doc = get().maskDocument;
    if (!doc) return;
    doc.reset();
    set({ maskRevision: doc.revision, userPixelCounts: doc.counts() });
    // Unlike before, a reset can be undone
    get().discardFuture();
    get().updateHistory();
    get().setMaskChanged(true);
  },

  updateConfusionMatrix: (matrix: ConfusionMatrix) => {
    // Validate confusion matrix structure
    if (!matrix || typeof matrix !== 'object') {
      console.error('[IRIS] updateConfusionMatrix: Invalid matrix object', matrix);
      return;
    }
    
    if (!Array.isArray(matrix.matrix) || matrix.matrix.length === 0) {
      console.error('[IRIS] updateConfusionMatrix: Invalid matrix array');
      return;
    }
    
    // Validate matrix is square
    const size = matrix.matrix.length;
    for (let i = 0; i < size; i++) {
      if (!Array.isArray(matrix.matrix[i]) || matrix.matrix[i].length !== size) {
        console.error('[IRIS] updateConfusionMatrix: Matrix is not square');
        return;
      }
    }
    
    set({ confusionMatrix: matrix });
  },

  clearConfusionMatrix: () => {
    set({ confusionMatrix: null });
  },

  getAccuracyStats: () => {
    const { confusionMatrix } = get();
    return confusionMatrix ? confusionMatrix.accuracyStats : null;
  },

  getConfusionMatrixData: () => {
    const { confusionMatrix } = get();
    return confusionMatrix ? confusionMatrix.matrix : null;
  },

  // Helper method to create confusion matrix from legacy data
  createConfusionMatrix: (
    matrix: number[][], 
    truePositives: { [classId: number]: number },
    userClasses: number[],
    classNames: string[]
  ): ConfusionMatrix => {
    const classCount = matrix.length;
    let totalSamples = 0;
    
    // Calculate total samples
    for (let i = 0; i < classCount; i++) {
      for (let j = 0; j < classCount; j++) {
        totalSamples += matrix[i][j];
      }
    }
    
    // Calculate per-class accuracy using the EXACT same logic as legacy code
    const perClassAccuracy: number[] = [];
    let minAccuracy = 1.0;
    let worstClass: number | null = null;
    let accSum = 0;
    let accProd = userClasses.length; // Start with user_classes.length like legacy code
    
    const testNSamples: { [classId: number]: { current: number } } = {};
    
    for (const classId of userClasses) {
      const tp = truePositives[classId] || 0;
      
      // Use test_n_samples.current like the original code, fallback to calculating from matrix
      let totalForClass = testNSamples[classId]?.current;
      
      if (!totalForClass) {
        // Fallback: calculate total samples for this class from the confusion matrix
        // This is the sum of the row (actual class samples)
        totalForClass = 0;
        if (classId < matrix.length) {
          for (let j = 0; j < matrix[classId].length; j++) {
            totalForClass += matrix[classId][j];
          }
        }
        // Ensure we don't divide by zero
        totalForClass = Math.max(totalForClass, 1);
      }
      
      const accuracy = tp / totalForClass;
      
      perClassAccuracy[classId] = accuracy;
      accSum += accuracy;
      accProd *= accuracy; // Multiply by accuracy like legacy code
      
      if (accuracy < minAccuracy) {
        minAccuracy = accuracy;
        worstClass = classId;
      }
    }
    
    // Calculate overall accuracy using EXACT same formula as legacy: acc_prod / acc_sum
    const overallAccuracy = userClasses.length > 0 && accSum > 0 ? accProd / accSum : 0;
    
    return {
      matrix,
      classCount,
      totalSamples,
      accuracyStats: {
        overall: overallAccuracy,
        perClass: perClassAccuracy,
        worstClass,
        worstAccuracy: minAccuracy,
        truePositives
      },
      timestamp: new Date(),
      classes: classNames
    };
  },

  resetViews: () => {
    useViewManagerStore.getState().resetCanvas();
  },

  setConfig: (config: ProjectConfig) => {
    // Validate config structure before setting
    if (!get().validateConfig(config)) {
      console.error('[IRIS] setConfig: Invalid config structure', config);
      return;
    }
    
    // Use set to update the store state
    set({ config });
    
    // Verify the config was actually set
    const currentState = get();
    if (currentState.config !== config) {
      console.error('[IRIS] setConfig: Failed to set config in store!', {
        expected: config.name,
        actual: currentState.config?.name || 'null'
      });
    }
    
    if (config.classes) {
      get().setClasses(config.classes);
    }
    if (config.segmentation?.mask_area) {
      get().setMaskArea(config.segmentation.mask_area);
    }
  },

  setUser: (user: UserInfo) => {
    // Basic validation
    if (!user || typeof user !== 'object') {
      console.error('[IRIS] setUser: Invalid user object', user);
      return;
    }
    
    if (!user.segmentation || typeof user.segmentation !== 'object') {
      console.error('[IRIS] setUser: Invalid segmentation object');
      return;
    }
    
    set({ user });
  },

  setMaskChanged: (changed: boolean) => {
    set({ maskChanged: changed });
    
    // Update dialogue flag based on mask changes
    if (changed) {
      get().setShowDialogueBeforeNextImage(true);
    } else {
      // When mask is saved (changed = false), reset the dialogue flag
      get().setShowDialogueBeforeNextImage(false);
    }
  },

  // Config Helper Methods
  getConfigSection: <T extends keyof ProjectConfig>(section: T) => {
    const { config } = get();
    return config ? config[section] : null;
  },

  updateConfigSection: <T extends keyof ProjectConfig>(section: T, data: ProjectConfig[T]) => {
    const { config } = get();
    if (!config) {
      console.error('[IRIS] updateConfigSection: No config available to update');
      return;
    }
    
    const updatedConfig = { ...config, [section]: data };
    
    if (!get().validateConfig(updatedConfig)) {
      console.error('[IRIS] updateConfigSection: Invalid config after update', { section, data });
      return;
    }
    
    get().setConfig(updatedConfig);
    
    if (section === 'classes') {
      get().setClasses(data as ClassConfig[]);
    }
    if (section === 'segmentation') {
      const segmentationData = data as ProjectConfig['segmentation'];
      if (segmentationData.mask_area) {
        get().setMaskArea(segmentationData.mask_area);
      }
    }
  },

  validateConfig: (config: ProjectConfig) => {
    try {
      // Basic structure validation
      if (!config || typeof config !== 'object') {
        console.error('[IRIS] validateConfig: Config is not an object');
        return false;
      }
      
      // Required fields validation
      const requiredFields = ['name', 'host', 'port', 'images', 'classes', 'views', 'view_groups', 'segmentation'];
      for (const field of requiredFields) {
        if (!(field in config)) {
          console.error(`[IRIS] validateConfig: Missing required field: ${field}`);
          return false;
        }
      }
      
      // Validate name
      if (typeof config.name !== 'string' || config.name.trim() === '') {
        console.error('[IRIS] validateConfig: Invalid name');
        return false;
      }
      
      // Validate host
      if (typeof config.host !== 'string' || config.host.trim() === '') {
        console.error('[IRIS] validateConfig: Invalid host');
        return false;
      }
      
      // Validate port
      if (typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
        console.error('[IRIS] validateConfig: Invalid port');
        return false;
      }
      
      // Validate classes
      if (!Array.isArray(config.classes)) {
        console.error('[IRIS] validateConfig: Classes must be an array');
        return false;
      }
      
      for (let i = 0; i < config.classes.length; i++) {
        const cls = config.classes[i];
        if (!cls || typeof cls !== 'object') {
          console.error(`[IRIS] validateConfig: Invalid class at index ${i}`);
          return false;
        }
        if (typeof cls.name !== 'string' || cls.name.trim() === '') {
          console.error(`[IRIS] validateConfig: Invalid class name at index ${i}`);
          return false;
        }
        if (!Array.isArray(cls.colour) || cls.colour.length !== 4) {
          console.error(`[IRIS] validateConfig: Invalid colour array length at index ${i}, expected 4 elements`);
          return false;
        }
        for (const colorValue of cls.colour) {
          if (typeof colorValue !== 'number' || colorValue < 0 || colorValue > 255) {
            console.error(`[IRIS] validateConfig: Invalid colour value at index ${i}, values must be 0-255`);
            return false;
          }
        }
      }
      
      // Validate views (can be array or object format)
      if (!config.views || (typeof config.views !== 'object')) {
        console.error('[IRIS] validateConfig: Views must be an array or object');
        return false;
      }
      
      if (Array.isArray(config.views)) {
        // Array format validation
        for (let i = 0; i < config.views.length; i++) {
          const view = config.views[i];
          if (!view || typeof view !== 'object') {
            console.error(`[IRIS] validateConfig: Invalid view at index ${i}`);
            return false;
          }
          if (typeof view.name !== 'string' || view.name.trim() === '') {
            console.error(`[IRIS] validateConfig: Invalid view name at index ${i}`);
            return false;
          }
          if (typeof view.type !== 'string' || view.type.trim() === '') {
            console.error(`[IRIS] validateConfig: Invalid view type at index ${i}`);
            return false;
          }
        }
      } else {
        // Object format validation (current IRIS format)
        const viewNames = Object.keys(config.views);
        if (viewNames.length === 0) {
          console.error('[IRIS] validateConfig: Views object is empty');
          return false;
        }
        
        for (const viewName of viewNames) {
          const view = config.views[viewName];
          if (!view || typeof view !== 'object') {
            console.error(`[IRIS] validateConfig: Invalid view '${viewName}'`);
            return false;
          }
          // View type is optional in object format, defaults to 'image'
          if (view.type && (typeof view.type !== 'string' || view.type.trim() === '')) {
            console.error(`[IRIS] validateConfig: Invalid view type for '${viewName}'`);
            return false;
          }
        }
      }
      
      // Validate view_groups (can be array or object format)
      if (!config.view_groups || (typeof config.view_groups !== 'object')) {
        console.error('[IRIS] validateConfig: View groups must be an array or object');
        return false;
      }
      
      if (Array.isArray(config.view_groups)) {
        // Array format validation (legacy)
        for (let i = 0; i < config.view_groups.length; i++) {
          const group = config.view_groups[i];
          if (!Array.isArray(group)) {
            console.error(`[IRIS] validateConfig: Invalid view group at index ${i} - must be array`);
            return false;
          }
          for (let j = 0; j < group.length; j++) {
            if (typeof group[j] !== 'string' || group[j].trim() === '') {
              console.error(`[IRIS] validateConfig: Invalid view name in group ${i} at index ${j}`);
              return false;
            }
          }
        }
      } else {
        // Object format validation (current IRIS format)
        const groupNames = Object.keys(config.view_groups);
        if (groupNames.length === 0) {
          console.error('[IRIS] validateConfig: View groups object is empty');
          return false;
        }
        
        for (const groupName of groupNames) {
          const group = config.view_groups[groupName];
          if (!Array.isArray(group)) {
            console.error(`[IRIS] validateConfig: Invalid view group '${groupName}' - must be array`);
            return false;
          }
          for (let j = 0; j < group.length; j++) {
            if (typeof group[j] !== 'string' || group[j].trim() === '') {
              console.error(`[IRIS] validateConfig: Invalid view name in group '${groupName}' at index ${j}`);
              return false;
            }
          }
        }
      }
      
      // Validate segmentation
      if (!config.segmentation || typeof config.segmentation !== 'object') {
        console.error('[IRIS] validateConfig: Invalid segmentation section');
        return false;
      }
      
      // Validate AI model if present
      if (config.segmentation.ai_model) {
        const aiModel = config.segmentation.ai_model;
        if (typeof aiModel.n_estimators !== 'number' || aiModel.n_estimators <= 0) {
          console.error('[IRIS] validateConfig: Invalid AI model field: n_estimators');
          return false;
        }
        if (typeof aiModel.max_depth !== 'number' || aiModel.max_depth <= 0) {
          console.error('[IRIS] validateConfig: Invalid AI model field: max_depth');
          return false;
        }
        if (typeof aiModel.n_leaves !== 'number' || aiModel.n_leaves <= 0) {
          console.error('[IRIS] validateConfig: Invalid AI model field: n_leaves');
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('[IRIS] validateConfig: Validation error:', error);
      return false;
    }
  },

  getConfigDebugInfo: () => {
    const { config } = get();
    
    return {
      loaded: config !== null,
      sections: config ? Object.keys(config) : [],
      valid: config ? get().validateConfig(config) : false,
      hasClasses: config?.classes ? config.classes.length : 0,
      hasViews: config?.views ? (Array.isArray(config.views) ? config.views.length : Object.keys(config.views).length) : 0,
      hasViewGroups: config?.view_groups ? (Array.isArray(config.view_groups) ? config.view_groups.length : Object.keys(config.view_groups).length) : 0,
      hasSegmentation: !!config?.segmentation,
      hasAIModel: !!config?.segmentation?.ai_model
    };
  },

  // Image Navigation State
  images: [],
  currentImageId: null,
  currentImageIndex: -1,

  setImages: (images) => {
    set({ images });
  },

  setCurrentImage: (imageId) => {
    // Validate input
    if (typeof imageId !== 'string' || imageId.trim() === '') {
      console.error('[IRIS] setCurrentImage: Invalid image ID', imageId);
      return;
    }

    const images = get().images;
    const index = images.findIndex(img => img.image_id === imageId);
    
    // Update store state
    set({ currentImageId: imageId, currentImageIndex: index });
  },

  navigateNext: () => {
    const { images, currentImageIndex } = get();
    if (currentImageIndex < images.length - 1) {
      const nextImage = images[currentImageIndex + 1];
      set({ 
        currentImageId: nextImage.image_id,
        currentImageIndex: currentImageIndex + 1
      });
      return nextImage.image_id;
    }
    return null;
  },

  navigatePrev: () => {
    const { images, currentImageIndex } = get();
    if (currentImageIndex > 0) {
      const prevImage = images[currentImageIndex - 1];
      set({ 
        currentImageId: prevImage.image_id,
        currentImageIndex: currentImageIndex - 1
      });
      return prevImage.image_id;
    }
    return null;
  },

  navigateToImage: (imageId) => {
    const images = get().images;
    const index = images.findIndex(img => img.image_id === imageId);
    if (index !== -1) {
      set({ currentImageId: imageId, currentImageIndex: index });
    }
  },

  getNextImageId: () => {
    const { images, currentImageIndex } = get();
    return (currentImageIndex >= 0 && currentImageIndex < images.length - 1) 
      ? images[currentImageIndex + 1].image_id 
      : null;
  },

  getPrevImageId: () => {
    const { images, currentImageIndex } = get();
    return (currentImageIndex > 0 && currentImageIndex < images.length) 
      ? images[currentImageIndex - 1].image_id 
      : null;
  },

  getCurrentImage: () => {
    const { images, currentImageIndex } = get();
    return images[currentImageIndex] || null;
  },
  
  // Debug actions
  setDebugMode: (debugMode) => set({ debugMode }),
  
  getDebugInfo: () => {
    const state = get();
    return {
      showMask: state.showMask,
      currentImageId: state.currentImageId,
      imagesCount: state.images.length,
      filtersActive: state.brightness !== 100 || state.saturation !== 100 || state.contrast || state.invert,
      brightness: state.brightness,
      saturation: state.saturation,
      contrast: state.contrast,
      invert: state.invert,
      // PHASE 1: Core drawing state debug info
      currentTool: state.currentTool,
      toolSize: state.toolSize,
      currentClass: state.currentClass,
      maskType: state.maskType,
      classesCount: state.classes.length,
      totalUserPixels: state.userPixelCounts.total,
      // PHASE 2: Navigation & Actions debug info
      hasConfig: state.config !== null,
      hasUser: state.user !== null,
      hasConfusionMatrix: state.confusionMatrix !== null,
      maskChanged: state.maskChanged,
      isLoading: state.isLoading,
      lastSaveTime: state.lastSaveTime ? state.lastSaveTime.toISOString() : null,
      // API URLs debug info
      hasApiUrls: state.apiUrls !== null,
    };
  },
}));
