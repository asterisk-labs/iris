/**
 * Structural check of a project config before it is put in the store.
 * Logs the first problem found. To be replaced by the generated schema
 * (IMPLEMENTATION_PLAN.md 0.2.C).
 */

import type { ProjectConfig } from '../types/iris';

export function validateConfig(config: ProjectConfig): boolean {
  try {
    // Basic structure validation
    if (!config || typeof config !== 'object') {
      console.error('[IRIS] validateConfig: Config is not an object');
      return false;
    }
    
    // Required fields validation
    const requiredFields = ['name', 'host', 'port', 'images', 'classes', 'views', 'view_groups', 'segmentation'];
    for (const field of requiredFields) {
      if (!(field in config)) {
        console.error(`[IRIS] validateConfig: Missing required field: ${field}`);
        return false;
      }
    }
    
    // Validate name
    if (typeof config.name !== 'string' || config.name.trim() === '') {
      console.error('[IRIS] validateConfig: Invalid name');
      return false;
    }
    
    // Validate host
    if (typeof config.host !== 'string' || config.host.trim() === '') {
      console.error('[IRIS] validateConfig: Invalid host');
      return false;
    }
    
    // Validate port
    if (typeof config.port !== 'number' || config.port < 1 || config.port > 65535) {
      console.error('[IRIS] validateConfig: Invalid port');
      return false;
    }
    
    // Validate classes
    if (!Array.isArray(config.classes)) {
      console.error('[IRIS] validateConfig: Classes must be an array');
      return false;
    }
    
    for (let i = 0; i < config.classes.length; i++) {
      const cls = config.classes[i];
      if (!cls || typeof cls !== 'object') {
        console.error(`[IRIS] validateConfig: Invalid class at index ${i}`);
        return false;
      }
      if (typeof cls.name !== 'string' || cls.name.trim() === '') {
        console.error(`[IRIS] validateConfig: Invalid class name at index ${i}`);
        return false;
      }
      if (!Array.isArray(cls.colour) || cls.colour.length !== 4) {
        console.error(`[IRIS] validateConfig: Invalid colour array length at index ${i}, expected 4 elements`);
        return false;
      }
      for (const colorValue of cls.colour) {
        if (typeof colorValue !== 'number' || colorValue < 0 || colorValue > 255) {
          console.error(`[IRIS] validateConfig: Invalid colour value at index ${i}, values must be 0-255`);
          return false;
        }
      }
    }
    
    // Validate views (can be array or object format)
    if (!config.views || (typeof config.views !== 'object')) {
      console.error('[IRIS] validateConfig: Views must be an array or object');
      return false;
    }
    
    if (Array.isArray(config.views)) {
      // Array format validation
      for (let i = 0; i < config.views.length; i++) {
        const view = config.views[i];
        if (!view || typeof view !== 'object') {
          console.error(`[IRIS] validateConfig: Invalid view at index ${i}`);
          return false;
        }
        if (typeof view.name !== 'string' || view.name.trim() === '') {
          console.error(`[IRIS] validateConfig: Invalid view name at index ${i}`);
          return false;
        }
        if (typeof view.type !== 'string' || view.type.trim() === '') {
          console.error(`[IRIS] validateConfig: Invalid view type at index ${i}`);
          return false;
        }
      }
    } else {
      // Object format validation (current IRIS format)
      const viewNames = Object.keys(config.views);
      if (viewNames.length === 0) {
        console.error('[IRIS] validateConfig: Views object is empty');
        return false;
      }
      
      for (const viewName of viewNames) {
        const view = config.views[viewName];
        if (!view || typeof view !== 'object') {
          console.error(`[IRIS] validateConfig: Invalid view '${viewName}'`);
          return false;
        }
        // View type is optional in object format, defaults to 'image'
        if (view.type && (typeof view.type !== 'string' || view.type.trim() === '')) {
          console.error(`[IRIS] validateConfig: Invalid view type for '${viewName}'`);
          return false;
        }
      }
    }
    
    // Validate view_groups (can be array or object format)
    if (!config.view_groups || (typeof config.view_groups !== 'object')) {
      console.error('[IRIS] validateConfig: View groups must be an array or object');
      return false;
    }
    
    if (Array.isArray(config.view_groups)) {
      // Array format validation (legacy)
      for (let i = 0; i < config.view_groups.length; i++) {
        const group = config.view_groups[i];
        if (!Array.isArray(group)) {
          console.error(`[IRIS] validateConfig: Invalid view group at index ${i} - must be array`);
          return false;
        }
        for (let j = 0; j < group.length; j++) {
          if (typeof group[j] !== 'string' || group[j].trim() === '') {
            console.error(`[IRIS] validateConfig: Invalid view name in group ${i} at index ${j}`);
            return false;
          }
        }
      }
    } else {
      // Object format validation (current IRIS format)
      const groupNames = Object.keys(config.view_groups);
      if (groupNames.length === 0) {
        console.error('[IRIS] validateConfig: View groups object is empty');
        return false;
      }
      
      for (const groupName of groupNames) {
        const group = config.view_groups[groupName];
        if (!Array.isArray(group)) {
          console.error(`[IRIS] validateConfig: Invalid view group '${groupName}' - must be array`);
          return false;
        }
        for (let j = 0; j < group.length; j++) {
          if (typeof group[j] !== 'string' || group[j].trim() === '') {
            console.error(`[IRIS] validateConfig: Invalid view name in group '${groupName}' at index ${j}`);
            return false;
          }
        }
      }
    }
    
    // Validate segmentation
    if (!config.segmentation || typeof config.segmentation !== 'object') {
      console.error('[IRIS] validateConfig: Invalid segmentation section');
      return false;
    }
    
    // Validate AI model if present
    if (config.segmentation.ai_model) {
      const aiModel = config.segmentation.ai_model;
      if (typeof aiModel.n_estimators !== 'number' || aiModel.n_estimators <= 0) {
        console.error('[IRIS] validateConfig: Invalid AI model field: n_estimators');
        return false;
      }
      if (typeof aiModel.max_depth !== 'number' || aiModel.max_depth <= 0) {
        console.error('[IRIS] validateConfig: Invalid AI model field: max_depth');
        return false;
      }
      if (typeof aiModel.n_leaves !== 'number' || aiModel.n_leaves <= 0) {
        console.error('[IRIS] validateConfig: Invalid AI model field: n_leaves');
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('[IRIS] validateConfig: Validation error:', error);
    return false;
  }
}
