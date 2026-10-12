/**
 * View Manager Store (Zustand)
 *
 * State for the image views: which views exist, how they are grouped, the
 * current image, and the zoom/pan transform shared by every view canvas.
 */

import { create } from 'zustand';
import type { ViewTransform } from '../segmentation/geometry/transform';

export interface ViewConfig {
  name: string;
  type: 'image' | 'bingmap';
  description: string;
}

export interface ViewGroup {
  [groupName: string]: string[]; // Array of view names
}

export interface ViewFilters {
  contrast: boolean;
  invert: boolean;
  brightness: number;
  saturation: number;
}

export interface ViewManagerState {
  views: { [name: string]: ViewConfig };
  viewGroups: ViewGroup;
  currentGroup: string;
  imageId: string | null;
  imageLocation: [number, number];
  imageAspectRatio: number;
  showControls: boolean;

  // Image dimensions (replaces vars.image_shape)
  imageDimensions: { width: number; height: number } | null;

  currentView: string | null;

  /** Zoom/pan in image-space terms, carried across viewport remounts */
  viewTransform: ViewTransform | null;

  // Keyboard filter shortcuts write here; see docs/agents/FINISH_MIGRATION_PLAN.md bug 1
  filters: ViewFilters;

  viewWidth: number;
  viewHeight: number;

  isInitialized: boolean;

  setViews: (views: { [name: string]: ViewConfig }) => void;
  setViewGroups: (groups: ViewGroup) => void;
  setCurrentGroup: (group: string) => void;
  setImage: (imageId: string, location: [number, number]) => void;
  setImageLocation: (location: [number, number]) => void;
  validateImageLocation: (location: [number, number]) => boolean;
  setShowControls: (show: boolean) => void;
  toggleControls: () => void;

  setImageDimensions: (width: number, height: number) => void;
  getImageShape: () => [number, number] | null;
  getImageAspectRatio: () => number;

  setCurrentView: (viewName: string | null) => void;

  addView: (name: string, position?: number) => void;
  removeView: (position: number) => void;
  replaceView: (position: number, name: string) => void;
  showNextGroup: () => void;
  showGroup: (groupName: string) => void;
  getCurrentViews: () => ViewConfig[];

  /** Zoom and pan shared by all view canvases; null is the default fit view. */
  setViewTransform: (t: ViewTransform | null) => void;
  resetCanvas: () => void;

  updateSize: () => void;
  calculateViewDimensions: () => [number, number];
  updateViewDimensions: () => void;

  setFilters: (filters: Partial<ViewFilters>) => void;
  resetFilters: () => void;

  setInitialized: (initialized: boolean) => void;
}

/** Persist current group and view layouts to localStorage */
function _persistViewState(get: () => ViewManagerState) {
  try {
    const { currentGroup, viewGroups } = get();
    localStorage.setItem('iris-view-state', JSON.stringify({
      currentGroup,
      viewLayouts: viewGroups,
    }));
  } catch { /* ignore */ }
}

export const useViewManagerStore = create<ViewManagerState>((set, get) => ({
  views: {},
  viewGroups: { default: [] },
  currentGroup: 'default',
  imageId: null,
  imageLocation: [0, 0],
  imageAspectRatio: 1,
  showControls: false,

  imageDimensions: null,

  currentView: null,

  viewTransform: null,

  filters: {
    contrast: false,
    invert: false,
    brightness: 100,
    saturation: 100,
  },

  viewWidth: 400,
  viewHeight: 400,

  isInitialized: false,

  setViews: (views) => set({ views }),

  setViewGroups: (viewGroups) => {
    set({ viewGroups });
    // Restore persisted group and view layout if available
    try {
      const saved = localStorage.getItem('iris-view-state');
      if (saved) {
        const state = JSON.parse(saved);
        if (state.currentGroup && viewGroups[state.currentGroup]) {
          set({ currentGroup: state.currentGroup });
        }
        if (state.viewLayouts) {
          const newGroups = { ...viewGroups };
          for (const [group, layout] of Object.entries(state.viewLayouts)) {
            if (newGroups[group] && Array.isArray(layout)) {
              newGroups[group] = layout as string[];
            }
          }
          set({ viewGroups: newGroups });
        }
      }
    } catch { /* ignore */ }
  },

  setCurrentGroup: (currentGroup) => {
    set({ currentGroup });
    _persistViewState(get);
  },

  setImage: (imageId, imageLocation) => {
    set({ imageId, imageLocation });
  },

  setImageLocation: (location) => {
    if (!get().validateImageLocation(location)) {
      console.warn('[IRIS] setImageLocation: Invalid coordinates', location);
      return;
    }
    set({ imageLocation: [location[0], location[1]] });
  },

  validateImageLocation: (location) => {
    if (!Array.isArray(location) || location.length !== 2) {
      return false;
    }

    const [lat, lon] = location;

    if (typeof lat !== 'number' || typeof lon !== 'number' ||
        isNaN(lat) || isNaN(lon)) {
      return false;
    }

    return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  },

  setShowControls: (showControls) => set({ showControls }),

  toggleControls: () => {
    set({ showControls: !get().showControls });
  },

  setImageDimensions: (width, height) => {
    if (typeof width !== 'number' || typeof height !== 'number' ||
        width <= 0 || height <= 0 || isNaN(width) || isNaN(height)) {
      console.error('[IRIS] setImageDimensions: Invalid dimensions', { width, height });
      return;
    }

    set({
      imageDimensions: { width, height },
      imageAspectRatio: width / height
    });

    get().updateViewDimensions();
  },

  getImageShape: () => {
    const { imageDimensions } = get();
    return imageDimensions ? [imageDimensions.width, imageDimensions.height] : null;
  },

  getImageAspectRatio: () => {
    const { imageDimensions } = get();
    return imageDimensions ? imageDimensions.width / imageDimensions.height : 1;
  },

  setCurrentView: (currentView) => {
    set({ currentView });
  },

  addView: (name, position = -1) => {
    const { viewGroups, currentGroup } = get();
    const newGroups = { ...viewGroups };
    const currentViews = [...newGroups[currentGroup]];

    if (position === -1) {
      currentViews.push(name);
    } else {
      currentViews.splice(position, 0, name);
    }

    newGroups[currentGroup] = currentViews;
    set({ viewGroups: newGroups });
    _persistViewState(get);
  },

  removeView: (position) => {
    const { viewGroups, currentGroup } = get();
    const newGroups = { ...viewGroups };
    const currentViews = [...newGroups[currentGroup]];

    if (currentViews.length > 1) { // Don't allow removing the last view
      currentViews.splice(position, 1);
      newGroups[currentGroup] = currentViews;
      set({ viewGroups: newGroups });
      _persistViewState(get);
    }
  },

  replaceView: (position, name) => {
    const { viewGroups, currentGroup } = get();
    const newGroups = { ...viewGroups };
    const currentViews = [...newGroups[currentGroup]];

    currentViews[position] = name;
    newGroups[currentGroup] = currentViews;
    set({ viewGroups: newGroups });
    _persistViewState(get);
  },

  showNextGroup: () => {
    const { viewGroups, currentGroup } = get();
    const groups = Object.keys(viewGroups);
    const currentIndex = groups.indexOf(currentGroup);
    const nextIndex = currentIndex >= groups.length - 1 ? 0 : currentIndex + 1;
    const nextGroup = groups[nextIndex];

    set({ currentGroup: nextGroup });
    _persistViewState(get);
  },

  showGroup: (groupName) => {
    const { viewGroups } = get();
    if (viewGroups[groupName]) {
      set({ currentGroup: groupName });
      _persistViewState(get);
    } else {
      console.warn(`[ViewManager] Group '${groupName}' not found`);
    }
  },

  getCurrentViews: () => {
    const { views, viewGroups, currentGroup } = get();
    const viewNames = viewGroups[currentGroup] || [];
    return viewNames.map(name => views[name]).filter(Boolean);
  },

  setViewTransform: (viewTransform) => set({ viewTransform }),

  resetCanvas: () => set({ viewTransform: null }),

  updateSize: () => {
    get().updateViewDimensions();
  },

  calculateViewDimensions: () => {
    const { imageDimensions } = get();
    const currentViews = get().getCurrentViews();

    const aspectRatio = imageDimensions ?
      imageDimensions.width / imageDimensions.height :
      get().imageAspectRatio;

    const horizontalSpacing = 10;
    const verticalSpacing = 150;

    const allowedWidth = Math.round(
      (window.innerWidth - horizontalSpacing) / currentViews.length
    );
    const allowedHeight = window.innerHeight - verticalSpacing;

    const idealWidth = Math.min(
      allowedWidth,
      allowedHeight * aspectRatio
    );
    const idealHeight = Math.min(
      idealWidth / aspectRatio,
      allowedHeight
    );

    const scaleFromVerticalLimit = Math.max(1, idealHeight / allowedHeight);
    const width = Math.round(idealWidth / scaleFromVerticalLimit);
    const height = Math.round(width / aspectRatio);

    return [width, height];
  },

  updateViewDimensions: () => {
    const [width, height] = get().calculateViewDimensions();
    set({ viewWidth: width, viewHeight: height });
  },

  setFilters: (newFilters) => {
    set({ filters: { ...get().filters, ...newFilters } });
  },

  resetFilters: () => {
    set({
      filters: {
        contrast: false,
        invert: false,
        brightness: 100,
        saturation: 100,
      }
    });
  },

  setInitialized: (isInitialized) => set({ isInitialized }),
}));

// Bridge for legacy JavaScript (segmentation.js) until it is ported
if (typeof window !== 'undefined') {
  const w = window as any;
  w.viewManagerStore = useViewManagerStore;

  if (w._pendingImageLocation) {
    useViewManagerStore.getState().setImageLocation(w._pendingImageLocation);
    w._pendingImageLocation = null;
  }

  w.setImageLocationInStore = (location: [number, number]) => {
    useViewManagerStore.getState().setImageLocation(location);
  };

  w.getImageLocationFromStore = (): [number, number] => {
    return useViewManagerStore.getState().imageLocation;
  };

  w.resetCanvasFromStore = () => {
    useViewManagerStore.getState().resetCanvas();
  };

  w.resetFiltersFromStore = () => {
    useViewManagerStore.getState().resetFilters();
  };
}
