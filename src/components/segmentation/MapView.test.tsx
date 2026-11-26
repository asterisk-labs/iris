import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '../../test/test-utils';
import MapView, { RERENDER_DELAY_MS } from './MapView';
import { useSegmentationStore } from '../../stores/segmentationStore';
import { MaskHistory } from '../../segmentation/mask/history';
import { NO_LABEL } from '../../segmentation/mask/MaskDocument';
import { Corners, pixelToLngLat } from '../../segmentation/geometry/georef';

type Handler = (event?: unknown) => void;

const { FakeMap } = vi.hoisted(() => {
  /** Enough of a MapLibre map to follow what the view does with it */
  class FakeMap {
    static instances: FakeMap[] = [];
    handlers: Record<string, Handler[]> = {};
    sources: Record<string, Record<string, unknown>> = {};
    layers: Record<string, { visibility?: string }> = {};
    touchZoomRotate = { disableRotation: vi.fn() };
    dragPan = { enable: vi.fn(), disable: vi.fn() };
    canvas = document.createElement('canvas');
    fitBounds = vi.fn();

    constructor(public options: Record<string, unknown>) {
      FakeMap.instances.push(this);
    }

    on(type: string, handler: Handler) { (this.handlers[type] ??= []).push(handler); }
    once(type: string, handler: Handler) { this.on(type, handler); }
    off(type: string, handler: Handler) { this.handlers[type] = (this.handlers[type] ?? []).filter((h) => h !== handler); }
    fire(type: string, event?: unknown) { (this.handlers[type] ?? []).forEach((h) => h(event)); }
    getCenter() { return { toArray: () => [0, 0] }; }
    getZoom() { return 10; }
    jumpTo() {}
    panBy() {}
    getCanvas() { return this.canvas; }
    addSource(id: string, source: Record<string, unknown>) {
      this.sources[id] = { ...source, setWarp: vi.fn(), play: vi.fn(), pause: vi.fn(), setData: vi.fn() };
    }
    getSource(id: string) { return this.sources[id]; }
    removeSource(id: string) { delete this.sources[id]; }
    addLayer(layer: { id: string; layout?: { visibility?: string } }) { this.layers[layer.id] = { ...layer.layout }; }
    getLayer(id: string) { return this.layers[id]; }
    removeLayer(id: string) { delete this.layers[id]; }
    setLayoutProperty(id: string, _name: string, value: string) { this.layers[id].visibility = value; }
    setPaintProperty() {}
    remove() {}
  }

  return { FakeMap };
});

vi.mock('maplibre-gl', () => ({ Map: FakeMap }));

/** Images load at once */
class LoadingImage {
  static urls: string[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  complete = true;
  set src(url: string) {
    LoadingImage.urls.push(url);
    setTimeout(() => this.onload?.());
  }
}

const corners: Corners = [[8, 46], [8.1, 46], [8.1, 45.9], [8, 45.9]];
const view = { name: 'RGB', type: 'image' as const, description: '' };

describe('MapView', () => {
  beforeEach(() => {
    FakeMap.instances = [];
    LoadingImage.urls = [];
    vi.stubGlobal('Image', LoadingImage);
    useSegmentationStore.setState({
      maskDocument: null, maskHistory: new MaskHistory(), canUndo: false, canRedo: false,
      currentTool: 'draw', toolSize: 1, currentClass: 1, showSatellite: true, showImage: true, showMask: true,
      camera: null, imageCorners: null,
    });
    const s = useSegmentationStore.getState();
    s.setImageDimensions(100, 100);
    s.setImageCorners(corners);
    s.setClasses([
      { name: 'background', colour: [0, 0, 0, 0] },
      { name: 'cloud', colour: [255, 255, 255, 255] },
    ]);
    s.setMaskArea([0, 0, 100, 100]);
    s.setMaskDimensions({ width: 100, height: 100 });
    s.setMasks(new Uint8Array(100 * 100).fill(NO_LABEL), new Uint8Array(100 * 100));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const renderMap = async () => {
    render(<MapView view={view} imageId="coast" />);
    const map = FakeMap.instances[0];
    await act(async () => {
      map.fire('load');
      await new Promise((resolve) => setTimeout(resolve));
    });
    return map;
  };

  it('puts the image, the mask and the satellite imagery on the map', async () => {
    const map = await renderMap();

    expect(map.options.bounds).toEqual([[8, 45.9], [8.1, 46]]);
    expect(map.sources.satellite.tiles).toEqual([expect.stringContaining('World_Imagery')]);
    expect(map.sources.image.coordinates).toEqual(corners);
    // The mask area is the whole image here
    (map.sources.mask.coordinates as Corners).forEach((corner, i) => {
      expect(corner[0]).toBeCloseTo(corners[i][0], 9);
      expect(corner[1]).toBeCloseTo(corners[i][1], 9);
    });
    expect(map.layers.image.visibility).toBe('visible');
  });

  it('paints the pixel under the mouse', async () => {
    const map = await renderMap();
    const [lng, lat] = pixelToLngLat({ width: 100, height: 100, corners }, [20.5, 30.5]);

    act(() => {
      map.fire('mousedown', { lngLat: { lng, lat }, originalEvent: { button: 0, buttons: 1 } });
      window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    });

    const s = useSegmentationStore.getState();
    expect(s.cursor).toEqual([20, 30]);
    expect(s.maskDocument!.final[30 * 100 + 20]).toBe(1);
  });

  it('switches the satellite imagery and the image on and off', async () => {
    const map = await renderMap();

    act(() => {
      useSegmentationStore.getState().toggleSatellite();
      useSegmentationStore.getState().toggleImage();
    });

    expect(map.layers.satellite.visibility).toBe('none');
    expect(map.layers.image.visibility).toBe('none');
  });

  it('fits the image again when the views are reset', async () => {
    const map = await renderMap();
    act(() => { useSegmentationStore.getState().resetViews(); });
    expect(map.fitBounds).toHaveBeenCalledWith([[8, 45.9], [8.1, 46]], { animate: false });
  });

  it('says so when the image has no coordinates', () => {
    useSegmentationStore.getState().setImageCorners(null);
    render(<MapView view={view} imageId="coast" />);
    expect(FakeMap.instances).toHaveLength(0);
    expect(screen.getByText(/needs georeferenced COGs/)).toBeInTheDocument();
  });

  it('renders the view again for a new brightness once the slider rests', async () => {
    useSegmentationStore.setState({ brightness: 100 });
    await renderMap();
    expect(LoadingImage.urls).toEqual(['/api/v1/images/coast/views/RGB']);

    vi.useFakeTimers();
    try {
      act(() => useSegmentationStore.setState({ brightness: 120 }));
      act(() => useSegmentationStore.setState({ brightness: 150 }));
      act(() => { vi.advanceTimersByTime(RERENDER_DELAY_MS - 1); });
      expect(LoadingImage.urls).toHaveLength(1);
      act(() => { vi.advanceTimersByTime(1); });
      expect(LoadingImage.urls).toEqual(['/api/v1/images/coast/views/RGB', '/api/v1/images/coast/views/RGB?brightness=1.5']);
    } finally {
      vi.useRealTimers();
      useSegmentationStore.setState({ brightness: 100 });
    }
  });
});
