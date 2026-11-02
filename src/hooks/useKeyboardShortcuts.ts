import { useEffect } from 'react';
import { handleShortcut, shortcutForButton } from '../segmentation/input/shortcuts';
import { useSegmentationStore } from '../stores/segmentationStore';

/** Whether a key event comes from somewhere the user is typing. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Segmentation keyboard shortcuts, active while `enabled` (no modal open)
 * and not while typing. Key combinations with Ctrl, Cmd or Alt are left to
 * the browser.
 */
export function useKeyboardShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      handleShortcut(event.code);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

/**
 * Hovering a toolbar button (class `toolbutton`, id `tb_<command>`) shows
 * its shortcut and description in the notice line.
 */
export function useToolbarHints(): void {
  useEffect(() => {
    const buttonFor = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>('.toolbutton[id^="tb_"]') : null;

    const onOver = (event: MouseEvent) => {
      const button = buttonFor(event.target);
      if (!button || button.contains(event.relatedTarget as Node | null)) return;
      const shortcut = shortcutForButton(button.id);
      if (shortcut) useSegmentationStore.getState().showNotice(shortcut.description, undefined, shortcut.key);
    };
    const onOut = (event: MouseEvent) => {
      const button = buttonFor(event.target);
      if (!button || button.contains(event.relatedTarget as Node | null)) return;
      if (shortcutForButton(button.id)) useSegmentationStore.getState().hideNotice();
    };
    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
    };
  }, []);
}
