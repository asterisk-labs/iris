import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import PreferencesModal from './PreferencesModal';
import { ThemeProvider } from '../contexts/ThemeContext';
import React from 'react';

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

/**
 * PreferencesModal Tests
 * 
 * These tests focus on the keyboard shortcut blocking functionality.
 * Full integration tests for unsaved changes are covered by Cypress E2E tests.
 */

describe('PreferencesModal - Keyboard Shortcuts', () => {
  let originalKeyDownHandler: ((event: KeyboardEvent) => void) | null;
  let originalKeyUpHandler: ((event: KeyboardEvent) => void) | null;

  beforeEach(() => {
    originalKeyDownHandler = document.body.onkeydown;
    originalKeyUpHandler = document.body.onkeyup;

    // Re-establish matchMedia mock (vi.restoreAllMocks in afterEach clears it)
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    // Mock fetch with proper URL handling
    global.fetch = vi.fn((url) => {
      // Handle both relative and absolute URLs
      const urlString = typeof url === 'string' ? url : url.toString();
      if (urlString.includes('/segmentation/api/user-config')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              config: {
                segmentation: {
                  ai_model: {
                    bands: ['B1'],
                    n_estimators: 100,
                    max_depth: 5,
                    num_leaves: 31,
                    suppress_threshold: 0.5,
                    postprocessing: { enabled: false, min_area: 10 },
                  },
                },
              },
              all_bands: ['B1', 'B2'],
              is_admin: false,
            }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    }) as any;
  });

  afterEach(() => {
    document.body.onkeydown = originalKeyDownHandler;
    document.body.onkeyup = originalKeyUpHandler;
    vi.restoreAllMocks();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderWithTheme(<PreferencesModal isOpen={true} onClose={onClose} />);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('leaves the page key handlers alone (shortcuts are switched off by the app while a modal is open)', () => {
    const mockKeyHandler = vi.fn();
    document.body.onkeydown = mockKeyHandler;
    renderWithTheme(<PreferencesModal isOpen={true} onClose={() => {}} />);
    expect(document.body.onkeydown).toBe(mockKeyHandler);
  });
});
