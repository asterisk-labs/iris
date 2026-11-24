import type { NavigationSlice, SliceCreator } from './types';

export const createNavigationSlice: SliceCreator<NavigationSlice> = (set, get) => ({
  images: [],
  currentImageId: null,
  currentImageIndex: -1,
  showDialogueBeforeNextImage: false,

  setImages: (images) => {
    const { currentImageId } = get();
    set({ images, currentImageIndex: images.findIndex(img => img.image_id === currentImageId) });
  },

  setCurrentImage: (imageId) => {
    if (typeof imageId !== 'string' || imageId.trim() === '') {
      console.error('[IRIS] setCurrentImage: Invalid image ID', imageId);
      return;
    }
    set({ currentImageId: imageId, currentImageIndex: get().images.findIndex(img => img.image_id === imageId) });
  },

  getPrevImageId: () => {
    const { images, currentImageIndex } = get();
    if (currentImageIndex < 0 || images.length < 2) return null;
    return images[(currentImageIndex - 1 + images.length) % images.length].image_id;
  },

  setShowDialogueBeforeNextImage: (show) => set({ showDialogueBeforeNextImage: show }),
});
