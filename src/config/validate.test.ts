import { describe, it, expect, vi } from 'vitest';
import { validateConfig } from './validate';
import type { ProjectConfig } from '../types/iris';

const validConfig: ProjectConfig = {
  name: "test-project",
  host: "localhost",
  port: 5000,
  images: "/path/to/images",
  classes: [
    {
      name: "Clear",
      colour: [255, 255, 255, 0] as [number, number, number, number],
      description: "Clear pixels"
    },
    {
      name: "Cloud",
      colour: [255, 255, 0, 70] as [number, number, number, number],
      description: "Cloud pixels"
    }
  ],
  views: {
    "RGB": {
      name: "RGB",
      type: "image",
      bands: ["$B4", "$B3", "$B2"]
    },
    "NDVI": {
      name: "NDVI", 
      type: "image",
      expression: "($B8 - $B4) / ($B8 + $B4)",
      colormap: "RdYlGn"
    }
  },
  view_groups: {
    "default": ["RGB", "NDVI"]
  },
  segmentation: {
    mask_path: "/path/to/masks",
    mask_area: [64, 64, 448, 448] as [number, number, number, number],
    ai_model: {
      n_estimators: 100,
      max_depth: 10,
      n_leaves: 31,
      train_ratio: 0.8,
      max_train_pixels: 10000,
      use_edge_filter: true,
      use_meshgrid: true,
      meshgrid_cells: "8x8",
      use_superpixels: false,
      bands: ["B2", "B3", "B4"],
      suppression_filter_size: 3,
      suppression_threshold: 0.5,
      suppression_default_class: 0
    },
    scoring: {
      enabled: true,
      metrics: ["f1_score", "jaccard_index"]
    }
  }
};

describe('Config Validation', () => {
  it('should validate complete valid config', () => {
        expect(validateConfig(validConfig)).toBe(true);
  });

  it('should reject config with missing required fields', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const incompleteConfig = { ...validConfig };
    delete (incompleteConfig as any).name;
    
    expect(validateConfig(incompleteConfig as any)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing required field: name')
    );
    
    consoleSpy.mockRestore();
  });

  it('should reject config with invalid name', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const invalidConfig = { ...validConfig, name: "" };
    
    expect(validateConfig(invalidConfig)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid name')
    );
    
    consoleSpy.mockRestore();
  });

  it('should reject config with invalid port', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const invalidConfig = { ...validConfig, port: -1 };
    
    expect(validateConfig(invalidConfig)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid port')
    );
    
    consoleSpy.mockRestore();
  });

  it('should reject config with invalid classes', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const invalidConfig = {
      ...validConfig,
      classes: [
        { name: "", colour: [255, 255, 255, 0] as [number, number, number, number] } // Invalid: empty name
      ]
    };
    
    expect(validateConfig(invalidConfig)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid class name at index 0')
    );
    
    consoleSpy.mockRestore();
  });

  it('should reject config with invalid class colors', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const invalidConfig = {
      ...validConfig,
      classes: [
        { name: "Test", colour: [300, 255, 255, 0] as [number, number, number, number] } // Invalid: color value > 255
      ]
    };
    
    expect(validateConfig(invalidConfig)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid colour value at index 0, values must be 0-255')
    );
    
    consoleSpy.mockRestore();
  });

  it('should reject config with invalid views', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const invalidConfig = {
      ...validConfig,
      views: {} // Invalid: empty views object
    };
    
    expect(validateConfig(invalidConfig)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Views object is empty")
    );
    
    consoleSpy.mockRestore();
  });

  it('should reject config with invalid AI model', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const invalidConfig = {
      ...validConfig,
      segmentation: {
        ...validConfig.segmentation,
        ai_model: {
          ...validConfig.segmentation.ai_model,
          n_estimators: "invalid" // Should be number
        }
      }
    };
    
    expect(validateConfig(invalidConfig as any)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid AI model field: n_estimators')
    );
    
    consoleSpy.mockRestore();
  });
});

describe('Error Handling', () => {
  it('should handle validation errors gracefully', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Test with completely invalid input
    expect(validateConfig(null as any)).toBe(false);
    expect(validateConfig(undefined as any)).toBe(false);
    expect(validateConfig("invalid" as any)).toBe(false);
    
    consoleSpy.mockRestore();
  });
});
