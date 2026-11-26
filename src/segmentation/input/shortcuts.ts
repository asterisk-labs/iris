/**
 * Keyboard shortcuts of the segmentation page: one table used both to
 * handle key presses and to show them in the tooltips of the controls.
 */

import { useSegmentationStore } from '../../stores/segmentationStore';
import { saveThenGo } from '../navigation';
import { biggerBrushSize, smallerBrushSize } from '../../stores/segmentation/toolSlice';

export interface Shortcut {
  /** Key label as shown to users. */
  key: string;
  description: string;
  /** KeyboardEvent.code values that trigger it. */
  codes?: readonly string[];
  /**
   * KeyboardEvent.key values that trigger it, for symbols whose place
   * depends on the keyboard layout (on a Spanish keyboard [ needs AltGr).
   */
  chars?: readonly string[];
  /** What it does, unless a component registers it with useShortcutAction(). */
  run?: () => void;
  /** Toolbar button id (without the `tb_` prefix) this shortcut belongs to. */
  command: string;
}

const store = () => useSegmentationStore.getState();
const views = () => useSegmentationStore.getState();

/** Resize the brush in use, the draw or the eraser one */
function resizeBrush(step: (size: number) => number) {
  const { currentTool, brushSizes, setBrushSize } = store();
  if (currentTool !== 'move') setBrushSize(currentTool, step(brushSizes[currentTool]));
}

function predict() {
  store().predictMask().catch((error: Error) => {
    store().showErrorModal(error.message, 'AI Prediction Error');
  });
}

export const SHORTCUTS = [
  { key: 'Backspace', command: 'previous_image', description: 'Save this image and open previous one', codes: ['Backspace'], run: () => { void saveThenGo('prev'); } },
  { key: 'Return', command: 'next_image', description: 'Save this image and open next one', codes: ['Enter'], run: () => { void saveThenGo('next'); } },
  { key: 'S', command: 'save_mask', description: 'Save this mask', codes: ['KeyS'], run: () => { store().saveCurrentMask().catch(() => {}); } },
  { key: 'U', command: 'undo', description: 'Undo last modification', codes: ['KeyU'], run: () => store().undo() },
  { key: 'R', command: 'redo', description: 'Redo modification', codes: ['KeyR'], run: () => store().redo() },
  { key: 'W', command: 'tool_move', description: 'Pan your current view by dragging and moving the cursor', codes: ['KeyW'], run: () => store().setCurrentTool('move') },
  { key: 'Z', command: 'tool_reset_views', description: 'Fit the image in the views again', codes: ['KeyZ'], run: () => views().resetViews() },
  { key: 'D', command: 'tool_draw', description: 'Draw pixels on the mask', codes: ['KeyD'], run: () => store().setCurrentTool('draw') },
  { key: 'E', command: 'tool_eraser', description: 'Erase previously drawn pixels', codes: ['KeyE'], run: () => store().setCurrentTool('eraser') },
  { key: '+', command: 'brush_bigger', description: 'Bigger brush or eraser, whichever is selected', chars: ['+', '='], run: () => resizeBrush(biggerBrushSize) },
  { key: '-', command: 'brush_smaller', description: 'Smaller brush or eraser, whichever is selected', chars: ['-'], run: () => resizeBrush(smallerBrushSize) },
  { key: 'N', command: 'reset_mask', description: 'Clear the whole mask', codes: ['KeyN'], run: () => store().requestResetMask() },
  { key: 'A', command: 'predict_mask', description: 'Use the AI to help you filling out the mask', codes: ['KeyA'], run: predict },
  { key: 'Space', command: 'toggle_mask', description: 'Toggle mask on/off', codes: ['Space'], run: () => store().toggleMask() },
  { key: 'P', command: 'toggle_image', description: 'Show or hide the image', codes: ['KeyP'], run: () => views().toggleImage() },
  { key: 'M', command: 'toggle_satellite', description: 'Show or hide the satellite imagery', codes: ['KeyM'], run: () => views().toggleSatellite() },
  { key: 'F', command: 'mask_final', description: 'Show the final mask combined from your pixels and the predictions by the AI', codes: ['KeyF'], run: () => store().setMaskType('final') },
  { key: 'G', command: 'mask_user', description: 'Show your drawn pixels only', codes: ['KeyG'], run: () => store().setMaskType('user') },
  { key: 'H', command: 'mask_errors', description: 'Show where the AI failed to predict correctly', codes: ['KeyH'], run: () => store().setMaskType('errors') },
  { key: 'C', command: 'toggle_contrast', description: 'Toggle contrast on/off', codes: ['KeyC'], run: () => store().setContrast(!store().contrast) },
  { key: 'I', command: 'toggle_invert', description: 'Toggle inversion on/off', codes: ['KeyI'], run: () => store().setInvert(!store().invert) },
  { key: '↑', command: 'brightness_up', description: 'Increase brightness (+10%)', codes: ['ArrowUp'], run: () => store().changeBrightness(true) },
  { key: '↓', command: 'brightness_down', description: 'Decrease brightness (-10%)', codes: ['ArrowDown'], run: () => store().changeBrightness(false) },
  { key: '→', command: 'saturation_up', description: 'Increase saturation (+20%)', codes: ['ArrowRight'], run: () => store().changeSaturation(true) },
  { key: '←', command: 'saturation_down', description: 'Decrease saturation (-20%)', codes: ['ArrowLeft'], run: () => store().changeSaturation(false) },
  { key: 'X', command: 'reset_filters', description: 'Reset all image filters', codes: ['KeyX'], run: () => store().resetFilters() },
  { key: 'V', command: 'show_view_controls', description: 'Toggle display of view controls on/off', codes: ['KeyV'], run: () => views().toggleControls() },
  {
    key: 'B', command: 'next_view_group', description: 'Switch to next group view', codes: ['KeyB'],
    run: () => {
      views().showNextGroup();
      store().showNotice(`Group: ${views().currentGroup}`);
    },
  },
  // Controls of the page, run by the components that own them
  { key: 'K', command: 'class_dialog', description: 'Open the list of classes', codes: ['KeyK'] },
  { key: 'O', command: 'export_geotiff', description: 'Export the image and mask as GeoTIFF', codes: ['KeyO'] },
  { key: 'T', command: 'image_info', description: 'Image information', codes: ['KeyT'] },
  { key: 'Q', command: 'stats', description: 'Confusion matrix and statistics', codes: ['KeyQ'] },
  { key: 'L', command: 'fold_layers', description: 'Fold or unfold the layers', codes: ['KeyL'] },
  { key: 'J', command: 'fold_adjustments', description: 'Fold or unfold the adjustments', codes: ['KeyJ'] },
  { key: '[', command: 'left_toolbar', description: 'Expand or collapse the toolbar', chars: ['['] },
  { key: ']', command: 'right_panel', description: 'Expand or collapse the side panel', chars: [']'] },
  { key: '.', command: 'profile', description: 'User profile', chars: ['.'] },
  { key: ',', command: 'settings', description: 'Settings', chars: [','] },
  { key: '?', command: 'help', description: 'Help', chars: ['?'] },
] as const satisfies readonly Shortcut[];

export type Command = (typeof SHORTCUTS)[number]['command'];

/** Digits 1..9 select class 0..8 (when that class exists). */
function selectClassFromDigit(code: string): boolean {
  const match = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (!match) return false;
  const classId = parseInt(match[1], 10) - 1;
  if (classId >= 0 && classId < store().classes.length) {
    store().setCurrentClass(classId);
  }
  return true;
}

const byCode = new Map<string, Shortcut>();
const byChar = new Map<string, Shortcut>();
for (const shortcut of SHORTCUTS as readonly Shortcut[]) {
  for (const code of shortcut.codes ?? []) byCode.set(code, shortcut);
  for (const char of shortcut.chars ?? []) byChar.set(char, shortcut);
}

/** Commands run by the components that registered them */
const actions = new Map<string, () => void>();

/** Run `action` for a command until the returned function is called. */
export function registerShortcutAction(command: Command, action: () => void): () => void {
  actions.set(command, action);
  return () => {
    if (actions.get(command) === action) actions.delete(command);
  };
}

/**
 * Run the shortcut for a key press. Returns whether one matched. When Alt
 * is held only the character counts, since Alt (or AltGr) changes it.
 */
export function handleShortcut(code: string, key = '', altKey = false): boolean {
  // Digits pick a class whatever they type, on AZERTY the 6 key types -
  if (!altKey && selectClassFromDigit(code)) return true;
  const shortcut = (!altKey && byCode.get(code)) || byChar.get(key);
  if (!shortcut) return false;
  (actions.get(shortcut.command) ?? shortcut.run)?.();
  return true;
}

/** The shortcut for a toolbar button id such as `tb_undo`. */
export function shortcutForButton(buttonId: string): (typeof SHORTCUTS)[number] | undefined {
  if (!buttonId.startsWith('tb_')) return undefined;
  const command = buttonId.slice(3);
  return SHORTCUTS.find(s => s.command === command);
}

/** Keys of some commands as shown to users, e.g. '↑ ↓'. */
export function shortcutKeys(...commands: Command[]): string {
  return commands
    .map(command => SHORTCUTS.find(s => s.command === command)?.key)
    .filter(Boolean)
    .join(' ');
}

/**
 * Props that make a control show a tooltip when the mouse is over it (see
 * TooltipLayer): what the control does and the keys of its shortcuts.
 */
export function tooltip(label: string, ...commands: Command[]) {
  const keys = shortcutKeys(...commands);
  return {
    'data-tooltip': label,
    ...(keys ? { 'data-shortcut': keys } : {}),
  };
}
