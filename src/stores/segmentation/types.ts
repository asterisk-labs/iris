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
import type { ViewTransform } from '../../segmentation/geometry/transform';
import type { Size } from '../../segmentation/geometry/brush';
import type { ActionInfo } from '../../services/actionInfo';
import type { MaskType } from '../../segmentation/mask/palette';

export type Tool = 'move' | 'draw' | 'eraser';
export type ToolShape = 'square' | 'round';
export type { MaskType };
export type MaskArea = [number, number, number, number];
export type ClassCounts = { [classId: number]: number; total: number };

export interface ImageInfo {
  image_id: string;
  has_user_annotation: boolean;
  has_any_annotation: boolean;
  annotation_count: number;
}

export interface ViewConfig {
  name: string;
  type: 'image' | 'bingmap';
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
  toolShape: ToolShape;
  currentClass: number;
  setCurrentTool: (tool: Tool) => void;
  setToolSize: (size: number) => void;
  setToolShape: (shape: ToolShape) => void;
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
  getNextImageId: () => string | null;
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
  imageLocation: [number, number];
  viewTransform: ViewTransform | null;
  viewWidth: number;
  viewHeight: number;
  setViews: (views: { [name: string]: ViewConfig }) => void;
  setViewGroups: (groups: ViewGroup) => void;
  setCurrentGroup: (group: string) => void;
  showNextGroup: () => void;
  setCurrentView: (viewName: string | null) => void;
  toggleControls: () => void;
  setImageDimensions: (width: number, height: number) => void;
  setImageLocation: (location: [number, number]) => void;
  addView: (name: string, position?: number) => void;
  removeView: (position: number) => void;
  replaceView: (position: number, name: string) => void;
  getCurrentViews: () => ViewConfig[];
  setViewTransform: (t: ViewTransform | null) => void;
  /** Back to the default fit-to-canvas view. */
  resetViews: () => void;
  updateViewDimensions: () => void;
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
