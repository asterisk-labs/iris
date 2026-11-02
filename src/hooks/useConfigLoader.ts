import { useCallback } from 'react';
import { useSegmentationStore } from '../stores/segmentationStore';
import { imageSizeFromShape, maskSizeFromArea } from '../segmentation/geometry/transform';
import type { ImageInfo } from '../stores/segmentation/types';
import { bootPage } from '../boot';

/**
 * Apply one image's geometry from the image list: its own size and mask
 * area (the configured area, or the whole image when none is configured).
 * Images in a dataset may differ in size, so this runs for the current
 * image after the list is loaded.
 */
export function applyImageGeometry(info: ImageInfo): void {
  const store = useSegmentationStore.getState();
  const size = imageSizeFromShape(info.shape);
  if (size) store.setImageDimensions(size.width, size.height);
  const area = info.mask_area ?? (size ? [0, 0, size.width, size.height] as [number, number, number, number] : null);
  if (area) {
    store.setMaskArea(area);
    store.setMaskDimensions(maskSizeFromArea(area));
  }
}

export interface ConfigLoaderResult {
  loading: boolean;
  error: string | null;
  loadConfig: () => Promise<void>;
}

export const useConfigLoader = (): ConfigLoaderResult => {
  const loadConfig = useCallback(async () => {
    try {
      // The image from the URL, or the one the server picked (last worked on)
      const urlParams = new URLSearchParams(window.location.search);
      const imageId = urlParams.get('image_id') || bootPage().imageId;
      
      // Load config and user data in parallel
      const [configResponse, userResponse] = await Promise.all([
        fetch('/segmentation/api/config', { credentials: 'same-origin' }),
        fetch('/user/get/current', { credentials: 'same-origin' })
      ]);

      if (!configResponse.ok) {
        throw new Error(`Config API failed: ${configResponse.statusText}`);
      }
      if (!userResponse.ok) {
        throw new Error(`User API failed: ${userResponse.statusText}`);
      }

      const config = await configResponse.json();
      const user = await userResponse.json();
      

      // Get stores directly to avoid dependency issues
      const segmentationStore = useSegmentationStore.getState();

      // CRITICAL: Set current image ID from URL or initial vars (before other initialization)
      if (imageId) {
        // CRITICAL: Clear any existing mask data before setting new image
        // This prevents the previous image's mask from being displayed
        segmentationStore.clearMask();
        
        segmentationStore.setCurrentImage(imageId);
      } else {
        console.warn('[IRIS] No image id in the URL or page data');
      }

      // Initialize segmentation store
      segmentationStore.setConfig(config);
      segmentationStore.setUser(user);
      segmentationStore.setClasses(config.classes || []);

      // Set current class to first class if available
      if (config.classes && config.classes.length > 0) {
        segmentationStore.setCurrentClass(0);
      }

      // Initialize ViewManager store
      let views: { [name: string]: any } = {};
      if (config.views) {
        // Handle both array and object formats
        if (Array.isArray(config.views)) {
          config.views.forEach((view: any) => {
            views[view.name] = {
              name: view.name,
              type: view.type || 'image',
              description: view.description || '',
            };
          });
        } else if (typeof config.views === 'object') {
          Object.entries(config.views).forEach(([name, view]: [string, any]) => {
            views[name] = {
              name: name,
              type: view.type || 'image',
              description: view.description || '',
            };
          });
        }
        
        segmentationStore.setViews(views);
      }

      // Set view groups
      if (config.view_groups) {
        if (Array.isArray(config.view_groups)) {
          // Handle array of arrays vs simple array
          if (config.view_groups.length > 0 && Array.isArray(config.view_groups[0])) {
            // Convert array of arrays format to object format
            const viewGroupsObj: { [key: string]: string[] } = {};
            config.view_groups.forEach((group: string[], index: number) => {
              viewGroupsObj[`group_${index}`] = group;
            });
            segmentationStore.setViewGroups(viewGroupsObj);
          } else {
            // Simple array - use as default group
            segmentationStore.setViewGroups({ default: config.view_groups as string[] });
          }
        } else {
          segmentationStore.setViewGroups(config.view_groups);
        }
      } else {
        // Default group with available views - use the views object we just created
        const viewNames = Object.keys(views || {});
        if (viewNames.length > 0) {
          segmentationStore.setViewGroups({ default: viewNames.slice(0, 3) });
        }
      }

      // Project-level image size and mask area. The server always serves
      // images.shape (derived from the first image when the config has
      // none). Both are refined per image once the image list is loaded,
      // see applyImageGeometry.
      const imageSize = imageSizeFromShape(config.images?.shape);
      if (imageSize) {
        segmentationStore.setImageDimensions(imageSize.width, imageSize.height);
      }
      const maskArea = config.segmentation?.mask_area as [number, number, number, number] | null | undefined;
      if (Array.isArray(maskArea) && maskArea.length === 4) {
        segmentationStore.setMaskArea(maskArea);
        segmentationStore.setMaskDimensions(maskSizeFromArea(maskArea));
      } else if (imageSize) {
        // No configured mask area: the whole image is the mask area
        const whole: [number, number, number, number] = [0, 0, imageSize.width, imageSize.height];
        segmentationStore.setMaskArea(whole);
        segmentationStore.setMaskDimensions(maskSizeFromArea(whole));
      }


    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ React: Config loading failed:', errorMessage);
      throw error;
    }
  }, []); // Empty dependency array to prevent re-creation

  return {
    loading: false, // You can add loading state if needed
    error: null,    // You can add error state if needed
    loadConfig
  };
};