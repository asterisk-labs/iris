import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { handleShortcut, registerShortcutAction, shortcutForButton } from './shortcuts';
import { useKeyboardShortcuts, useShortcutAction } from '../../hooks/useKeyboardShortcuts';
import { useSegmentationStore } from '../../stores/segmentationStore';

const classes = [
  { name: 'a', colour: [0, 0, 0, 255] as [number, number, number, number] },
  { name: 'b', colour: [0, 0, 0, 255] as [number, number, number, number] },
  { name: 'c', colour: [0, 0, 0, 255] as [number, number, number, number] },
];

describe('keyboard shortcuts', () => {
  beforeEach(() => {
    useSegmentationStore.setState({
      classes, currentClass: 0, currentTool: 'draw', showMask: true, maskType: 'final',
      contrast: false, invert: false, brightness: 100, saturation: 100, resetMaskConfirmOpen: false,
    });
    useSegmentationStore.setState({ camera: { center: [8, 46], zoom: 14 }, showControls: false });
  });

  it('selects classes with digits, ignoring missing classes', () => {
    handleShortcut('Digit3');
    expect(useSegmentationStore.getState().currentClass).toBe(2);
    handleShortcut('Numpad1');
    expect(useSegmentationStore.getState().currentClass).toBe(0);
    handleShortcut('Digit9');
    expect(useSegmentationStore.getState().currentClass).toBe(0);
  });

  it('switches tools and mask types', () => {
    handleShortcut('KeyE');
    expect(useSegmentationStore.getState().currentTool).toBe('eraser');
    handleShortcut('KeyG');
    expect(useSegmentationStore.getState().maskType).toBe('user');
    handleShortcut('Space');
    expect(useSegmentationStore.getState().showMask).toBe(false);
  });

  it('Z resets the view', () => {
    const before = useSegmentationStore.getState().resetViewsCount;
    handleShortcut('KeyZ');
    expect(useSegmentationStore.getState().camera).toBeNull();
    expect(useSegmentationStore.getState().resetViewsCount).toBe(before + 1);
  });

  it('M and P switch the satellite imagery and the image', () => {
    useSegmentationStore.setState({ showSatellite: true, showImage: true });
    handleShortcut('KeyM');
    handleShortcut('KeyP');
    expect(useSegmentationStore.getState()).toMatchObject({ showSatellite: false, showImage: false });
  });

  it('C, I and X change the filters that are actually drawn', () => {
    handleShortcut('KeyC');
    handleShortcut('KeyI');
    expect(useSegmentationStore.getState()).toMatchObject({ contrast: true, invert: true });
    handleShortcut('ArrowUp');
    expect(useSegmentationStore.getState().brightness).toBe(110);
    handleShortcut('KeyX');
    expect(useSegmentationStore.getState()).toMatchObject({ contrast: false, invert: false, brightness: 100 });
  });

  it('N asks to confirm resetting the mask', () => {
    handleShortcut('KeyN');
    expect(useSegmentationStore.getState().resetMaskConfirmOpen).toBe(true);
  });

  it('describes toolbar buttons', () => {
    expect(shortcutForButton('tb_undo')).toMatchObject({ key: 'U' });
    expect(shortcutForButton('tb_tool_reset_views')).toMatchObject({ key: 'Z' });
    expect(shortcutForButton('something')).toBeUndefined();
  });

  it('runs the action a component registered, until it unregisters', () => {
    const openHelp = vi.fn();
    const unregister = registerShortcutAction('help', openHelp);
    expect(handleShortcut('Slash', '?')).toBe(true);
    expect(openHelp).toHaveBeenCalledTimes(1);
    unregister();
    handleShortcut('Slash', '?');
    expect(openHelp).toHaveBeenCalledTimes(1);
  });

  it('matches symbols by the character typed, also with Alt (AltGr)', () => {
    const toggle = vi.fn();
    const unregister = registerShortcutAction('right_panel', toggle);
    // On a Spanish Mac keyboard ] is Option and the + key
    handleShortcut('BracketRight', ']', true);
    expect(toggle).toHaveBeenCalledTimes(1);
    // The same key without Option types +, which is not ]
    handleShortcut('BracketRight', '+');
    expect(toggle).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('ignores letters typed with Alt', () => {
    expect(handleShortcut('KeyE', '€', true)).toBe(false);
    expect(useSegmentationStore.getState().currentTool).toBe('draw');
  });

  it('selects a class with a digit key whatever it types', () => {
    useSegmentationStore.setState({ brushSizes: { draw: 5, eraser: 5 } });
    // On a French AZERTY keyboard the 3 key types "
    handleShortcut('Digit3', '"');
    expect(useSegmentationStore.getState().currentClass).toBe(2);
    // and the 6 key types -, which is not the smaller brush there
    handleShortcut('Digit6', '-');
    expect(useSegmentationStore.getState().brushSizes.draw).toBe(5);
  });
});

describe('useKeyboardShortcuts', () => {
  const press = (code: string, target: EventTarget = window, init: KeyboardEventInit = {}) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...init }));

  beforeEach(() => {
    useSegmentationStore.setState({ currentTool: 'draw' });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('handles keys while enabled and not while disabled', () => {
    const { rerender } = renderHook(({ enabled }) => useKeyboardShortcuts(enabled), { initialProps: { enabled: true } });
    press('KeyW');
    expect(useSegmentationStore.getState().currentTool).toBe('move');
    rerender({ enabled: false });
    press('KeyD');
    expect(useSegmentationStore.getState().currentTool).toBe('move');
  });

  it('runs the actions of mounted components for their keys', () => {
    const toggle = vi.fn();
    const { unmount } = renderHook(() => {
      useKeyboardShortcuts(true);
      useShortcutAction('left_toolbar', toggle);
    });
    press('BracketLeft', window, { key: '[' });
    expect(toggle).toHaveBeenCalledTimes(1);
    unmount();
    press('BracketLeft', window, { key: '[' });
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('keeps a focused button from also taking the key of a shortcut', () => {
    renderHook(() => useKeyboardShortcuts(true));
    const space = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true });
    window.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    const other = new KeyboardEvent('keydown', { code: 'KeyY', key: 'y', bubbles: true, cancelable: true });
    window.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it('ignores typing in form fields and modified keys', () => {
    renderHook(() => useKeyboardShortcuts(true));
    const input = document.createElement('input');
    document.body.append(input);
    press('KeyW', input);
    expect(useSegmentationStore.getState().currentTool).toBe('draw');
    press('KeyW', window, { ctrlKey: true });
    expect(useSegmentationStore.getState().currentTool).toBe('draw');
  });
});

describe('shortcut side effects', () => {
  it('A shows validation errors in the error modal', async () => {
    useSegmentationStore.setState({ userPixelCounts: { total: 0 }, isLoading: false, errorModal: { isOpen: false, title: '', message: '' } });
    handleShortcut('KeyA');
    await vi.waitFor(() => expect(useSegmentationStore.getState().errorModal.isOpen).toBe(true));
  });
});
