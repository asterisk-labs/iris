/**
 * The segmentation page's store. Defined in ./segmentation/ as slices of
 * one Zustand store; this module keeps the import path stable.
 */
export { useSegmentationStore } from './segmentation';
export type { SegmentationState, ImageInfo, ViewConfig, ViewGroup, MaskType, Tool, ToolShape } from './segmentation';
