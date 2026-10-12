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

  getNextImageId: () => {
    const { images, currentImageIndex } = get();
    return currentImageIndex >= 0 && currentImageIndex < images.length - 1
      ? images[currentImageIndex + 1].image_id
      : null;
  },

  getPrevImageId: () => {
    const { images, currentImageIndex } = get();
    return currentImageIndex > 0 && currentImageIndex < images.length
      ? images[currentImageIndex - 1].image_id
      : null;
  },

  setShowDialogueBeforeNextImage: (show) => set({ showDialogueBeforeNextImage: show }),
});
