import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSegmentationStore } from './index';
import { MaskHistory } from '../../segmentation/mask/history';
import type { ClassConfig, ProjectConfig } from '../../types/iris';

const initial = useSegmentationStore.getState();
const store = () => useSegmentationStore.getState();

const classes: ClassConfig[] = [
  { name: 'clear', colour: [0, 0, 0, 0] },
  { name: 'cloud', colour: [255, 255, 255, 255] },
  { name: 'shadow', colour: [0, 0, 0, 255] },
];

beforeEach(() => {
  useSegmentationStore.setState({ ...initial, maskHistory: new MaskHistory() }, true);
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('config slice', () => {
  const config = {
    name: 'p', host: 'h', port: 5000, images: {}, classes,
    views: { RGB: { name: 'RGB', type: 'image' } }, view_groups: { default: ['RGB'] },
    segmentation: { mask_area: [0, 0, 10, 10] },
  } as unknown as ProjectConfig;

  it('accepts a valid config and derives classes and mask area', () => {
    store().setConfig(config);
    expect(store().config).toBe(config);
    expect(store().classes).toEqual(classes);
    expect(store().maskArea).toEqual([0, 0, 10, 10]);
  });

  it('rejects an invalid config', () => {
    store().setConfig({ name: '' } as unknown as ProjectConfig);
    expect(store().config).toBeNull();
  });

  it('drops invalid classes and keeps the current class in range', () => {
    store().setClasses(classes);
    store().setCurrentClass(2);
    store().setClasses([classes[0], { name: '', colour: [0, 0, 0, 0] }, { name: 'bad', colour: [300, 0, 0, 0] as [number, number, number, number] }]);
    expect(store().classes).toEqual([classes[0]]);
    expect(store().currentClass).toBe(0);
  });

  it('validates the mask area and dimensions', () => {
    store().setMaskArea([1, 2, 3, 4]);
    store().setMaskArea([1, 2, 3] as unknown as [number, number, number, number]);
    expect(store().maskArea).toEqual([1, 2, 3, 4]);
    store().setMaskDimensions({ width: 0, height: 5 });
    expect(store().maskDimensions).toBeNull();
    store().setMaskDimensions({ width: 4, height: 5 });
    expect(store().maskDimensions).toEqual({ width: 4, height: 5 });
  });
});

describe('tool slice', () => {
  it('selecting a class switches to the draw tool', () => {
    store().setClasses(classes);
    store().setCurrentTool('eraser');
    store().setCurrentClass(1);
    expect(store()).toMatchObject({ currentClass: 1, currentTool: 'draw' });
    store().setCurrentClass(7);
    expect(store().currentClass).toBe(1);
  });

  it('clamps the brush size and ignores unknown tools and shapes', () => {
    store().setToolSize(500);
    expect(store().toolSize).toBe(100);
    store().setToolSize(0);
    expect(store().toolSize).toBe(1);
    store().setCurrentTool('lasso' as never);
    store().setToolShape('hex' as never);
    expect(store()).toMatchObject({ currentTool: 'draw', toolShape: 'square' });
  });
});

describe('filter slice', () => {
  it('steps and clamps brightness and saturation, and resets', () => {
    store().changeBrightness(true);
    store().changeSaturation(false);
    expect(store()).toMatchObject({ brightness: 110, saturation: 80 });
    store().setBrightness(5000);
    expect(store().brightness).toBe(800);
    store().setContrast(true);
    store().resetFilters();
    expect(store()).toMatchObject({ brightness: 100, saturation: 100, contrast: false, invert: false });
  });
});

describe('navigation slice', () => {
  const images = ['a', 'b', 'c'].map(image_id => ({ image_id, has_user_annotation: false, has_any_annotation: false, annotation_count: 0 }));

  it('finds the previous and next image', () => {
    store().setCurrentImage('b');
    store().setImages(images);
    expect(store().currentImageIndex).toBe(1);
    expect(store().getPrevImageId()).toBe('a');
    expect(store().getNextImageId()).toBe('c');
    store().setCurrentImage('c');
    expect(store().getNextImageId()).toBeNull();
  });

  it('handles an image that is not in the list', () => {
    store().setImages(images);
    store().setCurrentImage('zzz');
    expect(store().currentImageIndex).toBe(-1);
    expect(store().getNextImageId()).toBeNull();
    expect(store().getPrevImageId()).toBeNull();
  });

  it('ignores invalid image ids', () => {
    store().setCurrentImage('');
    expect(store().currentImageId).toBeNull();
  });
});

describe('view slice', () => {
  const views = {
    RGB: { name: 'RGB', type: 'image' as const, description: '' },
    Snow: { name: 'Snow', type: 'image' as const, description: '' },
    Radar: { name: 'Radar', type: 'image' as const, description: '' },
  };

  beforeEach(() => {
    store().setViews(views);
    store().setViewGroups({ default: ['RGB', 'Snow'], radar: ['Radar'] });
  });

  it('adds, replaces and removes views in the current group, keeping at least one', () => {
    store().addView('Radar', 1);
    expect(store().getCurrentViews().map(v => v.name)).toEqual(['RGB', 'Radar', 'Snow']);
    store().replaceView(0, 'Snow');
    store().removeView(0);
    store().removeView(0);
    expect(store().getCurrentViews().map(v => v.name)).toEqual(['Snow']);
    store().removeView(0);
    expect(store().getCurrentViews()).toHaveLength(1);
  });

  it('cycles groups and restores the saved group and layout on reload', () => {
    store().showNextGroup();
    expect(store().currentGroup).toBe('radar');
    store().showNextGroup();
    expect(store().currentGroup).toBe('default');
    store().addView('Radar');
    store().showNextGroup();

    useSegmentationStore.setState({ currentGroup: 'default' });
    store().setViewGroups({ default: ['RGB'], radar: ['Radar'] });
    expect(store().currentGroup).toBe('radar');
    expect(store().viewGroups.default).toEqual(['RGB', 'Snow', 'Radar']);
  });

  it('validates the image location', () => {
    store().setImageLocation([45.9, 8.06]);
    store().setImageLocation([95, 0]);
    store().setImageLocation([NaN, 0]);
    expect(store().imageLocation).toEqual([45.9, 8.06]);
  });

  it('validates image dimensions and sizes the views to the image aspect', () => {
    store().setImageDimensions(-1, 10);
    expect(store().imageDimensions).toBeNull();
    store().setImageDimensions(1024, 512);
    expect(store().imageDimensions).toEqual({ width: 1024, height: 512 });
    expect(store().viewWidth / store().viewHeight).toBeCloseTo(2, 1);
  });

  it('keeps and resets the shared transform', () => {
    store().setViewTransform({ zoom: 2, originX: 3, originY: 4 });
    store().resetViews();
    expect(store().viewTransform).toBeNull();
  });
});

describe('ui slice', () => {
  it('hides a timed notice after its timeout, unless replaced', () => {
    vi.useFakeTimers();
    store().showNotice('one', 100);
    vi.advanceTimersByTime(50);
    store().showNotice('two', 100, 'K');
    vi.advanceTimersByTime(60);
    expect(store().notice).toMatchObject({ text: 'two', key: 'K' });
    vi.advanceTimersByTime(60);
    expect(store().notice).toBeNull();
    vi.useRealTimers();
  });

  it('opens and closes the error modal and login request', () => {
    store().showErrorModal('boom', 'Oops');
    expect(store().errorModal).toEqual({ isOpen: true, title: 'Oops', message: 'boom' });
    store().hideErrorModal();
    expect(store().errorModal.isOpen).toBe(false);
    store().setLoadingMessage('busy');
    store().requestLogin();
    expect(store()).toMatchObject({ loginRequired: true, loadingMessage: null });
  });
});

describe('mask slice', () => {
  const pixels = (a: Uint8Array) => Array.from(a);

  beforeEach(() => {
    store().setClasses(classes);
    store().setMaskDimensions({ width: 3, height: 2 });
    store().setMasks(new Uint8Array(6), new Uint8Array(6));
    store().recordHistory();
  });

  it('needs mask dimensions to hold masks', () => {
    store().clearMask();
    useSegmentationStore.setState({ maskDimensions: null });
    store().setMasks(new Uint8Array(6), new Uint8Array(6));
    expect(store().maskDocument).toBeNull();
  });

  it('paints and erases, counting user pixels and marking the mask changed', () => {
    const before = store().maskRevision;
    store().paintPixels([0, 4], 2);
    expect(pixels(store().maskDocument!.final)).toEqual([2, 0, 0, 0, 2, 0]);
    expect(store().userPixelCounts).toEqual({ 0: 0, 1: 0, 2: 2, total: 2 });
    expect(store().maskRevision).toBeGreaterThan(before);
    expect(store()).toMatchObject({ maskChanged: true, showDialogueBeforeNextImage: true });
    store().paintPixels([0], null);
    expect(store().userPixelCounts.total).toBe(1);
  });

  it('undoes and redoes strokes and keeps the flags in step', () => {
    store().paintPixels([1], 1);
    store().recordHistory();
    store().paintPixels([2], 1);
    store().recordHistory();
    expect(store()).toMatchObject({ canUndo: true, canRedo: false });
    store().undo();
    expect(pixels(store().maskDocument!.user)).toEqual([0, 1, 0, 0, 0, 0]);
    expect(store().canRedo).toBe(true);
    store().redo();
    expect(pixels(store().maskDocument!.user)).toEqual([0, 1, 1, 0, 0, 0]);
    store().undo();
    store().paintPixels([5], 1);
    expect(store().canRedo).toBe(false);
  });

  it('reset clears the mask and can be undone', () => {
    store().paintPixels([3], 1);
    store().recordHistory();
    store().resetMask();
    expect(store().userPixelCounts.total).toBe(0);
    store().undo();
    expect(store().maskDocument!.user[3]).toBe(1);
  });

  it('saving clears the changed flag and the dialogue flag with it', () => {
    store().paintPixels([0], 1);
    store().setMaskChanged(false);
    expect(store()).toMatchObject({ maskChanged: false, showDialogueBeforeNextImage: false });
  });

  it('switches mask type and visibility', () => {
    store().setMaskType('errors');
    store().toggleMask();
    expect(store()).toMatchObject({ maskType: 'errors', showMask: false });
  });
});
