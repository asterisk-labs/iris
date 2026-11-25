import type { SliceCreator, ToolSlice } from './types';

const TOOLS = ['move', 'draw', 'eraser'] as const;
const SHAPES = ['square', 'round'] as const;
const MAX_TOOL_SIZE = 100;

/** Brush sizes the buttons and the + and - keys step through, in pixels */
export const BRUSH_SIZES = [1, 2, 3, 5, 8, 10, 15, 20, 30, 50, 75, 100];

export const biggerBrushSize = (size: number) =>
  BRUSH_SIZES.find((step) => step > size) ?? BRUSH_SIZES[BRUSH_SIZES.length - 1];

export const smallerBrushSize = (size: number) =>
  [...BRUSH_SIZES].reverse().find((step) => step < size) ?? BRUSH_SIZES[0];

const clampSize = (size: number) => Math.max(1, Math.min(size, MAX_TOOL_SIZE));

export const createToolSlice: SliceCreator<ToolSlice> = (set, get) => ({
  currentTool: 'draw',
  toolSize: 5,
  toolShape: 'square',
  brushSizes: { draw: 5, eraser: 5 },
  currentClass: 0,

  setCurrentTool: (tool) => {
    if (!TOOLS.includes(tool)) {
      console.warn('[IRIS] setCurrentTool: Invalid tool type provided', tool);
      return;
    }
    set({ currentTool: tool });
    // Each brush keeps its own size
    if (tool !== 'move') set({ toolSize: get().brushSizes[tool] });
  },

  setToolSize: (size) => {
    const toolSize = clampSize(size);
    set({ toolSize });
    // The size belongs to the brush in use
    const tool = get().currentTool;
    if (tool !== 'move') set((state) => ({ brushSizes: { ...state.brushSizes, [tool]: toolSize } }));
  },

  setBrushSize: (tool, size) => {
    const brushSize = clampSize(size);
    set((state) => ({ brushSizes: { ...state.brushSizes, [tool]: brushSize } }));
    if (get().currentTool === tool) set({ toolSize: brushSize });
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
