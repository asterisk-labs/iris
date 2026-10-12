import type { ClassConfig } from '../../types/iris';
import { validateConfig } from '../../config/validate';
import type { ConfigSlice, SliceCreator } from './types';

const isValidClass = (cls: ClassConfig) =>
  !!cls.name && cls.name.trim() !== '' &&
  Array.isArray(cls.colour) && cls.colour.length === 4 &&
  cls.colour.every(v => typeof v === 'number' && v >= 0 && v <= 255);

export const createConfigSlice: SliceCreator<ConfigSlice> = (set, get) => ({
  config: null,
  user: null,
  classes: [],
  maskArea: null,
  maskDimensions: null,

  setConfig: (config) => {
    if (!validateConfig(config)) {
      console.error('[IRIS] setConfig: Invalid config structure', config);
      return;
    }
    set({ config });
    if (config.classes) get().setClasses(config.classes);
    if (config.segmentation?.mask_area) get().setMaskArea(config.segmentation.mask_area);
  },

  setUser: (user) => {
    if (!user || typeof user !== 'object' || !user.segmentation || typeof user.segmentation !== 'object') {
      console.error('[IRIS] setUser: Invalid user object', user);
      return;
    }
    set({ user });
  },

  setClasses: (classes) => {
    if (!Array.isArray(classes)) {
      console.error('[IRIS] setClasses: Invalid classes array', classes);
      return;
    }
    const valid = classes.filter(cls => {
      const ok = isValidClass(cls);
      if (!ok) console.warn('[IRIS] setClasses: Invalid class definition', cls);
      return ok;
    });
    set({ classes: valid });
    get().maskDocument?.setClassCount(Math.max(valid.length, 1));
    if (get().currentClass >= valid.length) get().setCurrentClass(0);
  },

  setMaskArea: (area) => {
    if (area !== null && (!Array.isArray(area) || area.length !== 4 || !area.every(v => typeof v === 'number' && !isNaN(v)))) {
      console.error('[IRIS] setMaskArea: Invalid mask area coordinates', area);
      return;
    }
    set({ maskArea: area });
  },

  setMaskDimensions: (dimensions) => {
    const { width, height } = dimensions ?? {};
    if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) {
      console.error('[IRIS] setMaskDimensions: Invalid dimensions', dimensions);
      return;
    }
    set({ maskDimensions: { width, height } });
  },
});
