/**
 * Critical Mask Data Migration Tests
 * 
 * Focused tests for the most important migration in the IRIS system - vars.mask to React store.
 * This migration affects ALL drawing operations, mask visualization, save/load functionality,
 * undo/redo, and AI predictions.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { useSegmentationStore } from './segmentationStore';

// Mock window object for legacy compatibility
const mockWindow = {
  vars: {
    mask: null,
    user_mask: null,
    errors_mask: null,
    mask_shape: null,
    history: {
      mask: [],
      user_mask: [],
      current_epoch: 0,
      max_epochs: 30
    }
  }
};

beforeEach(() => {
  // Reset store state
  useSegmentationStore.setState({
    maskDocument: null,
    maskData: null,
    userMaskData: null,
    errorsMaskData: null,
    maskDimensions: null,
    maskHistory: [],
    userMaskHistory: [],
    historyCurrentEpoch: 0,
    historyMaxEpochs: 30
  });

  // Reset mock window
  mockWindow.vars.mask = null;
  mockWindow.vars.user_mask = null;
  mockWindow.vars.errors_mask = null;
  mockWindow.vars.mask_shape = null;
  mockWindow.vars.history = {
    mask: [],
    user_mask: [],
    current_epoch: 0,
    max_epochs: 30
  };

  // Mock window object
  vi.stubGlobal('window', mockWindow);
});

describe('Core Mask Data Operations', () => {
  test('sets and gets mask data with validation', () => {
    const testData = new Uint8Array([1, 2, 3, 4]);
    
    useSegmentationStore.getState().setMaskData(testData, 2, 2);
    
    const state = useSegmentationStore.getState();
    expect(state.maskData).toEqual(testData);
    expect(state.maskDimensions).toEqual({ width: 2, height: 2 });
    
    expect(state.maskData![0]).toBe(1);
    expect(state.maskData![3]).toBe(4);
  });

  test('validates input data and handles errors', () => {
    const store = useSegmentationStore.getState();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Test invalid data type
    store.setMaskData('invalid' as any, 2, 2);
    expect(consoleSpy).toHaveBeenCalledWith('[IRIS] setMaskData: Invalid data type, expected Uint8Array');
    
    // Test size mismatch
    const testData = new Uint8Array([1, 2, 3]);
    store.setMaskData(testData, 2, 2); // Should be 4 elements for 2x2
    expect(consoleSpy).toHaveBeenCalledWith('[IRIS] setMaskData: Data length mismatch', {
      dataLength: 3,
      expectedLength: 4
    });
    
    consoleSpy.mockRestore();
  });

  test('maintains immutability', () => {
    const store = useSegmentationStore.getState();
    const originalData = new Uint8Array([1, 2, 3, 4]);
    
    store.setMaskData(originalData, 2, 2);
    
    // Modify original array
    originalData[0] = 99;
    
    // Stored data should be unchanged (copied in)
    expect(useSegmentationStore.getState().maskData![0]).toBe(1);
  });

  test('calculates pixel counts correctly', () => {
    const store = useSegmentationStore.getState();
    
    // Set up test data
    const maskData = new Uint8Array([0, 1, 1, 2]);
    const userMaskData = new Uint8Array([1, 1, 0, 1]); // Only pixels 0, 1, 3 are user-drawn
    const classes = [
      { name: 'Class 0', colour: [255, 0, 0, 255] as [number, number, number, number] },
      { name: 'Class 1', colour: [0, 255, 0, 255] as [number, number, number, number] },
      { name: 'Class 2', colour: [0, 0, 255, 255] as [number, number, number, number] }
    ];
    
    store.setMaskData(maskData, 2, 2);
    store.setUserMaskData(userMaskData);
    store.setClasses(classes);
    
    const counts = store.calculatePixelCounts();
    
    // Expected: pixel 0 (class 0, user-drawn), pixel 1 (class 1, user-drawn), pixel 3 (class 2, user-drawn)
    expect(counts[0]).toBe(1); // Class 0: 1 user pixel
    expect(counts[1]).toBe(1); // Class 1: 1 user pixel  
    expect(counts[2]).toBe(1); // Class 2: 1 user pixel
    expect(counts.total).toBe(3);
  });
});

describe('User Mask Data Management', () => {
  test('manages user mask data with validation', () => {
    const store = useSegmentationStore.getState();
    
    // First set mask dimensions
    const maskData = new Uint8Array([1, 2, 3, 4]);
    store.setMaskData(maskData, 2, 2);
    
    // Then set user mask data
    const userMaskData = new Uint8Array([1, 0, 1, 0]);
    store.setUserMaskData(userMaskData);
    
    // Get fresh state after update
    const updatedStore = useSegmentationStore.getState();
    expect(updatedStore.userMaskData).toEqual(userMaskData);
  });

  test('validates user mask dimensions', () => {
    const store = useSegmentationStore.getState();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Try to set user mask without mask dimensions
    const userMaskData = new Uint8Array([1, 0, 1, 0]);
    store.setUserMaskData(userMaskData);
    
    expect(consoleSpy).toHaveBeenCalledWith('[IRIS] setUserMaskData: No mask dimensions set');
    
    consoleSpy.mockRestore();
  });
});

describe('History System', () => {
  test('manages undo/redo functionality', () => {
    const store = useSegmentationStore.getState();
    
    // Set up initial state
    const initialMask = new Uint8Array([1, 2, 3, 4]);
    const initialUserMask = new Uint8Array([1, 0, 1, 0]);
    
    store.setMaskData(initialMask, 2, 2);
    store.setUserMaskData(initialUserMask);
    store.updateHistory();
    
    // Make changes
    const modifiedMask = new Uint8Array([5, 6, 7, 8]);
    const modifiedUserMask = new Uint8Array([0, 1, 0, 1]);
    
    store.setMaskData(modifiedMask, 2, 2);
    store.setUserMaskData(modifiedUserMask);
    store.updateHistory();
    
    // Test undo/redo capabilities
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(false);
    
    // Undo should restore previous state
    store.undo();
    
    // Get fresh state after undo
    const undoStore = useSegmentationStore.getState();
    expect(undoStore.maskData).toEqual(initialMask);
    expect(undoStore.userMaskData).toEqual(initialUserMask);
    expect(undoStore.canRedo()).toBe(true);
    
    // Redo should restore modified state
    undoStore.redo();
    
    // Get fresh state after redo
    const redoStore = useSegmentationStore.getState();
    expect(redoStore.maskData).toEqual(modifiedMask);
    expect(redoStore.historyCurrentEpoch).toBe(1);
  });

  test('limits history size and discards future', () => {
    const store = useSegmentationStore.getState();
    
    // Set up mask data
    const maskData = new Uint8Array([1, 2, 3, 4]);
    const userMaskData = new Uint8Array([1, 0, 1, 0]);
    
    store.setMaskData(maskData, 2, 2);
    store.setUserMaskData(userMaskData);
    
    // Add more history entries than the limit
    const maxEpochs = store.historyMaxEpochs;
    for (let i = 0; i < maxEpochs + 5; i++) {
      const modifiedMask = new Uint8Array(maskData);
      modifiedMask[0] = i;
      store.setMaskData(modifiedMask, 2, 2);
      store.updateHistory();
    }
    
    // Should not exceed max epochs
    expect(store.maskHistory.length).toBeLessThanOrEqual(maxEpochs);
    
    // Test discard future
    store.undo();
    store.discardFuture();
    expect(store.canRedo()).toBe(false);
  });
});

describe('Painting', () => {
  test('paintPixels paints and erases through the mask document', () => {
    const store = useSegmentationStore.getState();
    store.setClasses([
      { name: 'a', colour: [0, 0, 0, 255] },
      { name: 'b', colour: [255, 0, 0, 255] },
    ]);
    store.setMaskData(new Uint8Array(4), 2, 2);
    store.setUserMaskData(new Uint8Array(4));
    const before = useSegmentationStore.getState().maskRevision;

    store.paintPixels([1, 3], 1);
    let state = useSegmentationStore.getState();
    expect(Array.from(state.maskData!)).toEqual([0, 1, 0, 1]);
    expect(Array.from(state.userMaskData!)).toEqual([0, 1, 0, 1]);
    expect(state.userPixelCounts).toEqual({ 0: 0, 1: 2, total: 2 });
    expect(state.maskRevision).toBeGreaterThan(before);
    expect(state.maskChanged).toBe(true);

    store.paintPixels([3], null);
    state = useSegmentationStore.getState();
    expect(Array.from(state.maskData!)).toEqual([0, 1, 0, 0]);
    expect(state.userPixelCounts.total).toBe(1);
  });

  test('undo restores an earlier state into the same document', () => {
    const store = useSegmentationStore.getState();
    store.setMaskData(new Uint8Array(4), 2, 2);
    store.setUserMaskData(new Uint8Array(4));
    store.updateHistory();
    const doc = useSegmentationStore.getState().maskDocument;
    store.paintPixels([0], 1);
    store.updateHistory();
    store.undo();
    const state = useSegmentationStore.getState();
    expect(state.maskDocument).toBe(doc);
    expect(Array.from(state.maskData!)).toEqual([0, 0, 0, 0]);
  });
});

describe('Performance', () => {

  test('handles large mask data efficiently', () => {
    const store = useSegmentationStore.getState();
    
    // Create moderately large mask (512x512)
    const size = 512 * 512;
    const largeMask = new Uint8Array(size);
    
    // Fill with test pattern
    for (let i = 0; i < size; i++) {
      largeMask[i] = i % 256;
    }
    
    const startTime = performance.now();
    store.setMaskData(largeMask, 512, 512);
    const endTime = performance.now();
    
    // Should complete in reasonable time (less than 50ms)
    expect(endTime - startTime).toBeLessThan(50);
    
    // Verify data integrity
    const stored = useSegmentationStore.getState().maskData!;
    expect(stored[0]).toBe(0);
    expect(stored[511 * 512 + 511]).toBe((511 * 512 + 511) % 256);
    
    // Test cleanup
    store.clearMask();
    expect(useSegmentationStore.getState().maskData).toBeNull();
    expect(useSegmentationStore.getState().maskHistory).toEqual([]);
  });
});

describe('Error Handling', () => {
  test('handles null data and edge cases gracefully', () => {
    const store = useSegmentationStore.getState();
    
    // Operations on null mask should not crash
    expect(store.copyMask()).toBeNull();
    
    const counts = store.calculatePixelCounts();
    expect(counts.total).toBe(0);
    
    // Test copy functionality with valid data
    store.setMaskData(new Uint8Array([1, 2, 3, 4]), 2, 2);
    const copy = store.copyMask();
    expect(copy).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(copy).not.toBe(useSegmentationStore.getState().maskData); // Should be different object
  });
});