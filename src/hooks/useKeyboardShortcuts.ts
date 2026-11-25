import { useEffect } from 'react';
import { handleShortcut } from '../segmentation/input/shortcuts';

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
