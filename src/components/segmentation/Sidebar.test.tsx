import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebars } from './Sidebar';

describe('useSidebars', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps the toolbar expanded for users who had it so before', () => {
    localStorage.setItem('leftToolbarExpanded', 'true');

    const { result } = renderHook(() => useSidebars());

    expect(result.current.leftExpanded).toBe(true);
    expect(localStorage.getItem('leftToolbarExpanded')).toBeNull();
  });

  it('remembers both columns', () => {
    const { result, unmount } = renderHook(() => useSidebars());
    act(() => result.current.toggleRight());
    unmount();

    const { result: again } = renderHook(() => useSidebars());
    expect(again.current).toMatchObject({ leftExpanded: false, rightExpanded: false });
  });
});
