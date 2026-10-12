import type { FilterSlice, SliceCreator } from './types';

const clamp = (value: number) => Math.max(0, Math.min(800, value));

export const createFilterSlice: SliceCreator<FilterSlice> = (set, get) => ({
  brightness: 100,
  saturation: 100,
  contrast: false,
  invert: false,

  setBrightness: (value) => set({ brightness: clamp(value) }),
  setSaturation: (value) => set({ saturation: clamp(value) }),
  setContrast: (enabled) => set({ contrast: enabled }),
  setInvert: (enabled) => set({ invert: enabled }),
  changeBrightness: (up) => get().setBrightness(get().brightness + (up ? 10 : -10)),
  changeSaturation: (up) => get().setSaturation(get().saturation + (up ? 20 : -20)),
  resetFilters: () => set({ brightness: 100, saturation: 100, contrast: false, invert: false }),
});
