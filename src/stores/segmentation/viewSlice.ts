import type { SliceCreator, ViewSlice, SegmentationState } from './types';

const STORAGE_KEY = 'iris-view-state';

/** Persist the current group and view layouts across reloads. */
function persistViewState(get: () => SegmentationState) {
  try {
    const { currentGroup, viewGroups } = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentGroup, viewLayouts: viewGroups }));
  } catch { /* storage unavailable */ }
}

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
    imageCorners: null,
    camera: null,
    resetViewsCount: 0,
    cursor: null,
    showImage: true,
    showSatellite: true,

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
    },

    setImageCorners: (imageCorners) => {
      // A new place on the map: look at the image, not where the last one was
      if (JSON.stringify(imageCorners) !== JSON.stringify(get().imageCorners)) {
        set({ imageCorners, camera: null });
      }
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

    setCamera: (camera) => set({ camera }),

    resetViews: () => set({ camera: null, resetViewsCount: get().resetViewsCount + 1 }),

    setCursor: (cursor) => set({ cursor }),

    toggleImage: () => set({ showImage: !get().showImage }),

    toggleSatellite: () => set({ showSatellite: !get().showSatellite }),
  };
};
