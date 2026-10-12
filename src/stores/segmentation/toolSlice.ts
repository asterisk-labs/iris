import type { SliceCreator, ToolSlice } from './types';

const TOOLS = ['move', 'draw', 'eraser'] as const;
const SHAPES = ['square', 'round'] as const;
const MAX_TOOL_SIZE = 100;

export const createToolSlice: SliceCreator<ToolSlice> = (set, get) => ({
  currentTool: 'draw',
  toolSize: 5,
  toolShape: 'square',
  currentClass: 0,

  setCurrentTool: (tool) => {
    if (!TOOLS.includes(tool)) {
      console.warn('[IRIS] setCurrentTool: Invalid tool type provided', tool);
      return;
    }
    set({ currentTool: tool });
  },

  setToolSize: (size) => {
    set({ toolSize: Math.max(1, Math.min(size, MAX_TOOL_SIZE)) });
  },

  setToolShape: (shape) => {
    if (!SHAPES.includes(shape)) {
      console.warn('[IRIS] setToolShape: Invalid shape type provided', shape);
      return;
    }
    set({ toolShape: shape });
  },

  /** Select a class and switch to the draw tool, as the legacy UI did. */
  setCurrentClass: (classId) => {
    const { classes } = get();
    // Allow setting a class before the classes are loaded
    if (classes.length > 0 && (classId < 0 || classId >= classes.length)) {
      console.warn(`Invalid class ID: ${classId}, available classes: 0-${classes.length - 1}`);
      return;
    }
    set({ currentClass: classId });
    if (classes.length > 0) get().setCurrentTool('draw');
  },
});
