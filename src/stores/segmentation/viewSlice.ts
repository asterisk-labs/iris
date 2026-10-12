import type { SliceCreator, ViewSlice, SegmentationState } from './types';

const STORAGE_KEY = 'iris-view-state';

/** Persist the current group and view layouts across reloads. */
function persistViewState(get: () => SegmentationState) {
  try {
    const { currentGroup, viewGroups } = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentGroup, viewLayouts: viewGroups }));
  } catch { /* storage unavailable */ }
}

const isValidLocation = (location: unknown): location is [number, number] => {
  if (!Array.isArray(location) || location.length !== 2) return false;
  const [lat, lon] = location;
  return typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
};

export const createViewSlice: SliceCreator<ViewSlice> = (set, get) => {
  /** Replace the current group's list of view names. */
  const setCurrentViewNames = (names: string[]) => {
    const { viewGroups, currentGroup } = get();
    set({ viewGroups: { ...viewGroups, [currentGroup]: names } });
    persistViewState(get);
  };

  return {
    views: {},
    viewGroups: { default: [] },
    currentGroup: 'default',
    currentView: null,
    showControls: false,
    imageDimensions: null,
    imageLocation: [0, 0],
    viewTransform: null,
    viewWidth: 400,
    viewHeight: 400,

    setViews: (views) => set({ views }),

    setViewGroups: (viewGroups) => {
      set({ viewGroups });
      // Restore the persisted group and layouts where they still fit the config
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        const state = JSON.parse(saved);
        if (state.currentGroup && viewGroups[state.currentGroup]) {
          set({ currentGroup: state.currentGroup });
        }
        if (state.viewLayouts) {
          const restored = { ...viewGroups };
          for (const [group, layout] of Object.entries(state.viewLayouts)) {
            if (restored[group] && Array.isArray(layout)) restored[group] = layout as string[];
          }
          set({ viewGroups: restored });
        }
      } catch { /* ignore */ }
    },

    setCurrentGroup: (currentGroup) => {
      set({ currentGroup });
      persistViewState(get);
    },

    showNextGroup: () => {
      const groups = Object.keys(get().viewGroups);
      const index = groups.indexOf(get().currentGroup);
      get().setCurrentGroup(groups[index >= groups.length - 1 ? 0 : index + 1]);
    },

    setCurrentView: (currentView) => set({ currentView }),

    toggleControls: () => set({ showControls: !get().showControls }),

    setImageDimensions: (width, height) => {
      if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0 || isNaN(width) || isNaN(height)) {
        console.error('[IRIS] setImageDimensions: Invalid dimensions', { width, height });
        return;
      }
      set({ imageDimensions: { width, height } });
      get().updateViewDimensions();
    },

    setImageLocation: (location) => {
      if (!isValidLocation(location)) {
        console.warn('[IRIS] setImageLocation: Invalid coordinates', location);
        return;
      }
      set({ imageLocation: [location[0], location[1]] });
    },

    addView: (name, position = -1) => {
      const names = [...(get().viewGroups[get().currentGroup] ?? [])];
      if (position === -1) names.push(name);
      else names.splice(position, 0, name);
      setCurrentViewNames(names);
    },

    removeView: (position) => {
      const names = [...(get().viewGroups[get().currentGroup] ?? [])];
      if (names.length <= 1) return; // keep at least one view
      names.splice(position, 1);
      setCurrentViewNames(names);
    },

    replaceView: (position, name) => {
      const names = [...(get().viewGroups[get().currentGroup] ?? [])];
      names[position] = name;
      setCurrentViewNames(names);
    },

    getCurrentViews: () => {
      const { views, viewGroups, currentGroup } = get();
      return (viewGroups[currentGroup] || []).map(name => views[name]).filter(Boolean);
    },

    setViewTransform: (viewTransform) => set({ viewTransform }),

    resetViews: () => set({ viewTransform: null }),

    updateViewDimensions: () => {
      const { imageDimensions } = get();
      const aspect = imageDimensions ? imageDimensions.width / imageDimensions.height : 1;
      const count = Math.max(get().getCurrentViews().length, 1);
      const allowedWidth = Math.round((window.innerWidth - 10) / count);
      const allowedHeight = window.innerHeight - 150;
      const idealWidth = Math.min(allowedWidth, allowedHeight * aspect);
      const idealHeight = Math.min(idealWidth / aspect, allowedHeight);
      const width = Math.round(idealWidth / Math.max(1, idealHeight / allowedHeight));
      set({ viewWidth: width, viewHeight: Math.round(width / aspect) });
    },
  };
};
