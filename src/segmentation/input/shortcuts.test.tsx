import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { handleShortcut, shortcutForButton } from './shortcuts';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
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
    useSegmentationStore.setState({ viewTransform: { zoom: 2, originX: 1, originY: 1 }, showControls: false });
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
    handleShortcut('KeyZ');
    expect(useSegmentationStore.getState().viewTransform).toBeNull();
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
