import { describe, it, expect, beforeEach } from 'vitest';
import { useViewManagerStore } from './viewManagerStore';

describe('viewManagerStore', () => {
  beforeEach(() => {
    // Reset store state
    useViewManagerStore.setState({
      views: {},
      viewGroups: { default: [] },
      currentGroup: 'default',
      imageId: null,
    });
  });

  it('initializes with default state', () => {
    const state = useViewManagerStore.getState();
    expect(state.views).toEqual({});
    expect(state.currentGroup).toBe('default');
    expect(state.imageId).toBeNull();
  });

  it('updates current group', () => {
    const { setCurrentGroup } = useViewManagerStore.getState();
    setCurrentGroup('test-group');
    expect(useViewManagerStore.getState().currentGroup).toBe('test-group');
  });
});
