/**
 * Types of the segmentation store and its slices.
 *
 * The store is one Zustand store assembled from slices (see index.ts).
 * Slices are spread flat, so their keys share one namespace; the check at
 * the bottom fails the build if two slices declare the same key.
 */

import type { StateCreator } from 'zustand';
import type { ClassConfig, ConfusionMatrix, ProjectConfig, UserInfo } from '../../types/iris';
import type { MaskDocument } from '../../segmentation/mask/MaskDocument';
import type { MaskHistory } from '../../segmentation/mask/history';
import type { Size } from '../../segmentation/geometry/brush';
import type { Corners, LngLat } from '../../segmentation/geometry/georef';
import type { ActionInfo } from '../../services/actionInfo';
import type { MaskType } from '../../segmentation/mask/palette';

export type Tool = 'move' | 'draw' | 'eraser';
export type { MaskType };
export type MaskArea = [number, number, number, number];
export type ClassCounts = { [classId: number]: number; total: number };

export interface ImageInfo {
  image_id: string;
  has_user_annotation: boolean;
  has_any_annotation: boolean;
  annotation_count: number;
  /** [height, width] of this image, read by the server from the file */
  shape?: [number, number];
  /** [x0, y0, x1, y1] mask area for this image (configured, or the whole image) */
  mask_area?: [number, number, number, number];
  /** [lon, lat] of the image corners, clockwise from the top left; null without a CRS */
  corners?: Corners | null;
}

/** Where the maps of the views look, shared by all of them */
export interface Camera {
  center: LngLat;
  zoom: number;
}

export interface ViewConfig {
  name: string;
  type: 'image';
  description: string;
}

export interface ViewGroup {
  [groupName: string]: string[];
}

/** Project config, current user, and what is derived from the config. */
export interface ConfigSlice {
  config: ProjectConfig | null;
  user: UserInfo | null;
  classes: ClassConfig[];
  maskArea: MaskArea | null;
  maskDimensions: Size | null;
  setConfig: (config: ProjectConfig) => void;
  setUser: (user: UserInfo) => void;
  setClasses: (classes: ClassConfig[]) => void;
  setMaskArea: (area: MaskArea | null) => void;
  setMaskDimensions: (dimensions: Size) => void;
}

/** The mask being edited, its history and how it is shown. */
export interface MaskSlice {
  maskDocument: MaskDocument | null;
  /** Changes whenever the mask does. */
  maskRevision: number;
  /** maskRevision right after the last prediction; the score describes the mask while they match. */
  predictionRevision: number | null;
  userPixelCounts: ClassCounts;
  maskHistory: MaskHistory;
  canUndo: boolean;
  canRedo: boolean;
  maskChanged: boolean;
  maskType: MaskType;
  showMask: boolean;
  confusionMatrix: ConfusionMatrix | null;
  /** Replace the masks (and reset the errors mask), creating the document if needed. */
  setMasks: (final: Uint8Array, user: Uint8Array) => void;
  clearMask: () => void;
  /** Paint pixels (mask indices) with a class, or erase them when classId is null. */
  paintPixels: (indices: number[], classId: number | null) => void;
  /** Record the current mask as an undo step (after a stroke, load, reset or prediction). */
  recordHistory: () => void;
  undo: () => void;
  redo: () => void;
  resetMask: () => void;
  setMaskChanged: (changed: boolean) => void;
  setMaskType: (type: MaskType) => void;
  setShowMask: (visible: boolean) => void;
  toggleMask: () => void;
}

/** Brush and class selection. */
export interface ToolSlice {
  currentTool: Tool;
  toolSize: number;
  /** Brush size of the draw and the eraser tool, each kept on its own */
  brushSizes: { draw: number; eraser: number };
  currentClass: number;
  setCurrentTool: (tool: Tool) => void;
  setToolSize: (size: number) => void;
  setBrushSize: (tool: 'draw' | 'eraser', size: number) => void;
  setCurrentClass: (classId: number) => void;
}

/** CSS filters on the image views. */
export interface FilterSlice {
  brightness: number;
  saturation: number;
  contrast: boolean;
  invert: boolean;
  setBrightness: (value: number) => void;
  setSaturation: (value: number) => void;
  setContrast: (enabled: boolean) => void;
  setInvert: (enabled: boolean) => void;
  changeBrightness: (up: boolean) => void;
  changeSaturation: (up: boolean) => void;
  resetFilters: () => void;
}

/** The project's images and which one is open. */
export interface NavigationSlice {
  images: ImageInfo[];
  currentImageId: string | null;
  currentImageIndex: number;
  /** Ask for action info before leaving the image (set when the mask is edited). */
  showDialogueBeforeNextImage: boolean;
  setImages: (images: ImageInfo[]) => void;
  setCurrentImage: (imageId: string) => void;
  /** The image before this one in the user's order, wrapping round. */
  getPrevImageId: () => string | null;
  setShowDialogueBeforeNextImage: (show: boolean) => void;
}

/** Image views, their grouping and layout, and the shared zoom/pan. */
export interface ViewSlice {
  views: { [name: string]: ViewConfig };
  viewGroups: ViewGroup;
  currentGroup: string;
  currentView: string | null;
  showControls: boolean;
  imageDimensions: Size | null;
  /** Corners of the current image on the map, null when it has no CRS */
  imageCorners: Corners | null;
  /** Where the maps look; null fits the image */
  camera: Camera | null;
  /** Counts the resets of the views, for the maps to fit the image again */
  resetViewsCount: number;
  /** Pixel of the image under the mouse, in whichever view it is */
  cursor: [number, number] | null;
  showImage: boolean;
  /** Satellite imagery below and around the image */
  showSatellite: boolean;
  setViews: (views: { [name: string]: ViewConfig }) => void;
  setViewGroups: (groups: ViewGroup) => void;
  setCurrentGroup: (group: string) => void;
  showNextGroup: () => void;
  setCurrentView: (viewName: string | null) => void;
  toggleControls: () => void;
  setImageDimensions: (width: number, height: number) => void;
  setImageCorners: (corners: Corners | null) => void;
  addView: (name: string, position?: number) => void;
  removeView: (position: number) => void;
  replaceView: (position: number, name: string) => void;
  getCurrentViews: () => ViewConfig[];
  setCamera: (camera: Camera | null) => void;
  /** Fit the image in the views again. */
  resetViews: () => void;
  setCursor: (cursor: [number, number] | null) => void;
  toggleImage: () => void;
  toggleSatellite: () => void;
}

/** Page-level feedback and modal requests. */
export interface UiSlice {
  /** A request (load, save, predict) is in progress. */
  isLoading: boolean;
  loadingMessage: string | null;
  notice: { text: string; key?: string; id: number } | null;
  errorModal: { isOpen: boolean; title: string; message: string };
  loginRequired: boolean;
  actionInfoPrompt: { action: ActionInfo; targetImageId: string } | null;
  resetMaskConfirmOpen: boolean;
  setLoadingMessage: (text: string | null) => void;
  showNotice: (text: string, timeoutMs?: number, key?: string) => void;
  hideNotice: () => void;
  showErrorModal: (message: string, title?: string) => void;
  hideErrorModal: () => void;
  requestLogin: () => void;
  clearLoginRequest: () => void;
  openActionInfoPrompt: (action: ActionInfo, targetImageId: string) => void;
  closeActionInfoPrompt: () => void;
  requestResetMask: () => void;
  closeResetMaskConfirm: () => void;
}

/** Requests that change several slices at once. */
export interface MaskIoActions {
  loadMaskForImage: (imageId: string) => Promise<void>;
  saveCurrentMask: () => Promise<void>;
  predictMask: () => Promise<void>;
}

type Slices = [ConfigSlice, MaskSlice, ToolSlice, FilterSlice, NavigationSlice, ViewSlice, UiSlice, MaskIoActions];

export type SegmentationState =
  ConfigSlice & MaskSlice & ToolSlice & FilterSlice & NavigationSlice & ViewSlice & UiSlice & MaskIoActions;

export type SliceCreator<T> = StateCreator<SegmentationState, [], [], T>;

// ---- No two slices may declare the same key --------------------------------

type OverlapWith<H, R extends unknown[]> =
  R extends [infer F, ...infer Rest] ? (keyof H & keyof F) | OverlapWith<H, Rest> : never;
type AllOverlaps<T extends unknown[]> =
  T extends [infer H, ...infer R] ? OverlapWith<H, R> | AllOverlaps<R> : never;

/** If this fails to compile, the error names the key declared by two slices. */
export const noDuplicateSliceKeys: [AllOverlaps<Slices>] extends [never] ? true : AllOverlaps<Slices> = true;
