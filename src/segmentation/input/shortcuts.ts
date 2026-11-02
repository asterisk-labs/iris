/**
 * Keyboard shortcuts of the segmentation page: one table used both to
 * handle key presses and to describe them in toolbar hints.
 */

import { useSegmentationStore } from '../../stores/segmentationStore';
import { saveThenGo } from '../navigation';

export interface Shortcut {
  /** Key label as shown to users. */
  key: string;
  description: string;
  /** KeyboardEvent.code values that trigger it. */
  codes: string[];
  run: () => void;
  /** Toolbar button id (without the `tb_` prefix) this shortcut belongs to. */
  command?: string;
}

const store = () => useSegmentationStore.getState();
const views = () => useSegmentationStore.getState();

function predict() {
  store().predictMask().catch((error: Error) => {
    store().showErrorModal(error.message, 'AI Prediction Error');
  });
}

export const SHORTCUTS: Shortcut[] = [
  { key: 'Backspace', command: 'previous_image', description: 'Save this image and open previous one', codes: ['Backspace'], run: () => { void saveThenGo('prev'); } },
  { key: 'Return', command: 'next_image', description: 'Save this image and open next one', codes: ['Enter'], run: () => { void saveThenGo('next'); } },
  { key: 'S', command: 'save_mask', description: 'Save this mask', codes: ['KeyS'], run: () => { store().saveCurrentMask().catch(() => {}); } },
  { key: 'U', command: 'undo', description: 'Undo last modification', codes: ['KeyU'], run: () => store().undo() },
  { key: 'R', command: 'redo', description: 'Redo modification', codes: ['KeyR'], run: () => store().redo() },
  { key: 'W', command: 'tool_move', description: 'Pan your current view by dragging and moving the cursor', codes: ['KeyW'], run: () => store().setCurrentTool('move') },
  { key: 'Z', command: 'tool_reset_views', description: 'Reset the view in the canvases', codes: ['KeyZ'], run: () => views().resetViews() },
  { key: 'D', command: 'tool_draw', description: 'Draw pixels on the mask', codes: ['KeyD'], run: () => store().setCurrentTool('draw') },
  { key: 'E', command: 'tool_eraser', description: 'Erase previously drawn pixels', codes: ['KeyE'], run: () => store().setCurrentTool('eraser') },
  { key: 'N', command: 'reset_mask', description: 'Clear the whole mask', codes: ['KeyN'], run: () => store().requestResetMask() },
  { key: 'A', command: 'predict_mask', description: 'Use the AI to help you filling out the mask', codes: ['KeyA'], run: predict },
  { key: 'Space', command: 'toggle_mask', description: 'Toggle mask on/off', codes: ['Space'], run: () => store().toggleMask() },
  { key: 'F', command: 'mask_final', description: 'Show the final mask combined from your pixels and the predictions by the AI', codes: ['KeyF'], run: () => store().setMaskType('final') },
  { key: 'G', command: 'mask_user', description: 'Show your drawn pixels only', codes: ['KeyG'], run: () => store().setMaskType('user') },
  { key: 'H', command: 'mask_errors', description: 'Show where the AI failed to predict correctly', codes: ['KeyH'], run: () => store().setMaskType('errors') },
  { key: 'C', command: 'toggle_contrast', description: 'Toggle contrast on/off', codes: ['KeyC'], run: () => store().setContrast(!store().contrast) },
  { key: 'I', command: 'toggle_invert', description: 'Toggle inversion on/off', codes: ['KeyI'], run: () => store().setInvert(!store().invert) },
  { key: 'Arrow-Up', command: 'brightness_up', description: 'Increase brightness (+10%)', codes: ['ArrowUp'], run: () => store().changeBrightness(true) },
  { key: 'Arrow-Down', command: 'brightness_down', description: 'Decrease brightness (-10%)', codes: ['ArrowDown'], run: () => store().changeBrightness(false) },
  { key: 'Arrow-Right', command: 'saturation_up', description: 'Increase saturation (+20%)', codes: ['ArrowRight'], run: () => store().changeSaturation(true) },
  { key: 'Arrow-Left', command: 'saturation_down', description: 'Decrease saturation (-20%)', codes: ['ArrowLeft'], run: () => store().changeSaturation(false) },
  { key: 'X', command: 'reset_filters', description: 'Reset all image filters', codes: ['KeyX'], run: () => store().resetFilters() },
  { key: 'V', command: 'show_view_controls', description: 'Toggle display of view controls on/off', codes: ['KeyV'], run: () => views().toggleControls() },
  {
    key: 'B', command: 'next_view_group', description: 'Switch to next group view', codes: ['KeyB'],
    run: () => {
      views().showNextGroup();
      store().showNotice(`Group: ${views().currentGroup}`);
    },
  },
];

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
for (const shortcut of SHORTCUTS) {
  for (const code of shortcut.codes) byCode.set(code, shortcut);
}

/** Run the shortcut for a key press. Returns whether one matched. */
export function handleShortcut(code: string): boolean {
  const shortcut = byCode.get(code);
  if (shortcut) {
    shortcut.run();
    return true;
  }
  return selectClassFromDigit(code);
}

/** The shortcut for a toolbar button id such as `tb_undo`. */
export function shortcutForButton(buttonId: string): Shortcut | undefined {
  if (!buttonId.startsWith('tb_')) return undefined;
  const command = buttonId.slice(3);
  return SHORTCUTS.find(s => s.command === command);
}
