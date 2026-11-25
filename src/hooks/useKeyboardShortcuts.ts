import { useEffect, useRef } from 'react';
import { Command, handleShortcut, registerShortcutAction } from '../segmentation/input/shortcuts';

/** Whether a key event comes from somewhere the user is typing. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Segmentation keyboard shortcuts, active while `enabled` (no modal open)
 * and not while typing. Key combinations with Ctrl or Cmd are left to the
 * browser, and with Alt only the symbol it types counts.
 */
export function useKeyboardShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Windows reports AltGr as Ctrl+Alt
      const altGraph = event.getModifierState?.('AltGraph') ?? false;
      if (((event.ctrlKey || event.metaKey) && !altGraph) || isTyping(event.target)) return;
      // A focused button would also take Space or Enter as a click
      if (handleShortcut(event.code, event.key, event.altKey)) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

/**
 * Run `action` for the shortcut of `command` while the component is
 * mounted. Without a command nothing is bound.
 */
export function useShortcutAction(command: Command | undefined, action: () => void): void {
  const actionRef = useRef(action);
  actionRef.current = action;
  useEffect(() => {
    if (!command) return undefined;
    return registerShortcutAction(command, () => actionRef.current());
  }, [command]);
}
