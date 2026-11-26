/**
 * Map of one view
 *
 * Each view is a MapLibre map with the image of the view at its place on
 * the map, over satellite imagery, and the mask, the brush and the outline
 * of the mask area on top. All maps share one camera, so zooming or panning
 * one moves the others.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CanvasSource, GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ViewConfig } from '../../stores/segmentationStore';
import { useSegmentationStore } from '../../stores/segmentationStore';
import { useTheme } from '../../contexts/ThemeContext';
import { appUrls } from '../../services/http';
import { Georef, areaCorners, cornersBounds, lngLatToPixel, pixelToLngLat } from '../../segmentation/geometry/georef';
import { brushOffset } from '../../segmentation/geometry/brush';
import { biggerBrushSize, smallerBrushSize } from '../../stores/segmentation/toolSlice';
import { continueStroke, endStroke, startStroke } from '../../segmentation/map/painter';
import { watchMaskCanvas } from '../../segmentation/map/maskCanvas';

const ESRI_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

type CanvasCorners = [[number, number], [number, number], [number, number], [number, number]];

const NO_FEATURES: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Maps on screen, kept on the same camera */
const maps = new Set<MapLibreMap>();
let syncing = false;

/** Footprint of the brush at an image pixel, as the painter stamps it */
const brushPolygon = (georef: Georef, [x, y]: [number, number], size: number): Feature => {
  const x0 = x + brushOffset(size);
  const y0 = y + brushOffset(size);
  const ring = ([[x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size]] as [number, number][])
    .map((pixel) => pixelToLngLat(georef, pixel));
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } };
};

/** CSS filter of the image, set in the side panel */
const imageFilter = () => {
  const { brightness, saturation, contrast, invert } = useSegmentationStore.getState();
  return [
    invert ? 'invert(1)' : '',
    `brightness(${brightness}%)`,
    contrast ? 'contrast(200%)' : '',
    `saturate(${saturation}%)`,
  ].filter(Boolean).join(' ');
};

/** Show the current pixels of a canvas source */
const refreshCanvasSource = (map: MapLibreMap, id: string) => {
  const source = map.getSource(id) as CanvasSource | undefined;
  if (!source) return;
  source.play();
  map.once('render', () => source.pause());
};

const addCanvasSource = (map: MapLibreMap, id: string, canvas: HTMLCanvasElement, corners: CanvasCorners, visible: boolean) => {
  map.addSource(id, { type: 'canvas', canvas, coordinates: corners, animate: false });
  // Pin the canvas bilinearly to its corners, as georef.ts expects
  (map.getSource(id) as CanvasSource).setWarp?.('flat');
  map.addLayer(
    {
      id,
      type: 'raster',
      source: id,
      layout: { visibility: visible ? 'visible' : 'none' },
      paint: { 'raster-resampling': 'nearest', 'raster-fade-duration': 0 },
    },
    // From the bottom: satellite, image, mask, brush, mask area. The image
    // may load after the mask was added.
    id === 'image' && map.getLayer('mask') ? 'mask' : 'brush'
  );
};

interface MapViewProps {
  view: ViewConfig;
  imageId: string;
}

const MapView: React.FC<MapViewProps> = ({ view, imageId }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  /** Callbacks waiting for the style and our layers */
  const pendingRef = useRef<Set<(map: MapLibreMap) => void> | null>(new Set());
  const { theme } = useTheme();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const corners = useSegmentationStore((s) => s.imageCorners);
  const size = useSegmentationStore((s) => s.imageDimensions);
  const maskArea = useSegmentationStore((s) => s.maskArea);
  const viewCount = useSegmentationStore((s) => s.getCurrentViews().length);

  const georef = useMemo<Georef | null>(
    () => (corners && size ? { width: size.width, height: size.height, corners } : null),
    [corners, size]
  );

  /** Run fn once the map takes sources and layers */
  const whenReady = (fn: (map: MapLibreMap) => void) => {
    const map = mapRef.current;
    if (!map) return () => {};
    const pending = pendingRef.current;
    if (!pending) {
      fn(map);
      return () => {};
    }
    pending.add(fn);
    return () => { pending.delete(fn); };
  };

  // The map
  useEffect(() => {
    if (!containerRef.current || !georef) return undefined;

    const { camera, showSatellite } = useSegmentationStore.getState();
    const map = new MapLibreMap({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': theme.bgCanvas } }],
      },
      ...(camera ? { center: camera.center, zoom: camera.zoom } : { bounds: cornersBounds(georef.corners) }),
      attributionControl: { compact: false },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      keyboard: false,
      doubleClickZoom: false,
      boxZoom: false,
      renderWorldCopies: false,
      maxZoom: 24,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;
    pendingRef.current = new Set();
    maps.add(map);

    map.on('move', () => {
      if (syncing) return;
      syncing = true;
      const target = { center: map.getCenter(), zoom: map.getZoom() };
      maps.forEach((other) => { if (other !== map) other.jumpTo(target); });
      syncing = false;
    });
    map.on('moveend', () => {
      if (syncing) return;
      useSegmentationStore.getState().setCamera({
        center: map.getCenter().toArray() as [number, number],
        zoom: map.getZoom(),
      });
    });

    map.on('load', () => {
      map.addSource('satellite', {
        type: 'raster', tiles: [ESRI_IMAGERY], tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri',
      });
      map.addLayer({
        id: 'satellite',
        type: 'raster',
        source: 'satellite',
        layout: { visibility: showSatellite ? 'visible' : 'none' },
      });
      map.addSource('brush', { type: 'geojson', data: NO_FEATURES });
      map.addLayer({
        id: 'brush', type: 'fill', source: 'brush', paint: { 'fill-color': 'rgb(150, 150, 150)', 'fill-opacity': 0.5 },
      });
      map.addSource('mask-area', { type: 'geojson', data: NO_FEATURES });
      map.addLayer({
        id: 'mask-area', type: 'line', source: 'mask-area',
        paint: { 'line-color': 'red', 'line-width': 2, 'line-dasharray': [2.5, 7.5] },
      });

      const pending = pendingRef.current;
      pendingRef.current = null;
      pending?.forEach((fn) => fn(map));
    });

    return () => {
      maps.delete(map);
      map.remove();
      mapRef.current = null;
    };
    // The background follows the theme without making a new map, see below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [georef]);

  // Background colour of the theme
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer('background')) map.setPaintProperty('background', 'background-color', theme.bgCanvas);
  }, [theme.bgCanvas]);

  // Layers switched on and off, and resetting the views
  useEffect(() => useSegmentationStore.subscribe((s, prev) => {
    const map = mapRef.current;
    if (!map) return;
    const show = (layer: string, visible: boolean) => {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', visible ? 'visible' : 'none');
    };
    if (s.showImage !== prev.showImage) show('image', s.showImage);
    if (s.showSatellite !== prev.showSatellite) show('satellite', s.showSatellite);
    if (s.showMask !== prev.showMask) show('mask', s.showMask);
    if (s.resetViewsCount !== prev.resetViewsCount && georef) {
      map.fitBounds(cornersBounds(georef.corners), { animate: false });
    }
  }), [georef]);

  // Outline of the mask area
  useEffect(() => {
    if (!georef || !maskArea) return undefined;
    return whenReady((map) => {
      const ring = areaCorners(georef, maskArea);
      (map.getSource('mask-area') as GeoJSONSource).setData({
        type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [...ring, ring[0]] },
      });
      map.setPaintProperty('mask-area', 'line-width', viewCount < 2 ? 3 : 2);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [georef, maskArea, viewCount]);

  // The image of the view, rendered by the server, with the filters of the side panel
  useEffect(() => {
    if (!georef) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = georef.width;
    canvas.height = georef.height;
    const image = new Image();
    let cancelled = false;
    let cancelReady = () => {};

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx || !image.complete) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.filter = imageFilter();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (mapRef.current) refreshCanvasSource(mapRef.current, 'image');
    };

    setStatus('loading');
    image.onload = () => {
      if (cancelled) return;
      draw();
      setStatus('ready');
      cancelReady = whenReady((map) => {
        if (!map.getSource('image')) {
          addCanvasSource(map, 'image', canvas, georef.corners, useSegmentationStore.getState().showImage);
        }
      });
    };
    image.onerror = () => { if (!cancelled) setStatus('error'); };
    image.src = `${appUrls().main}api/v1/images/${encodeURIComponent(imageId)}/views/${encodeURIComponent(view.name)}`;

    const unsubscribe = useSegmentationStore.subscribe((s, prev) => {
      if (s.brightness !== prev.brightness || s.saturation !== prev.saturation
          || s.contrast !== prev.contrast || s.invert !== prev.invert) draw();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      cancelReady();
      const map = mapRef.current;
      if (map?.getLayer('image')) map.removeLayer('image');
      if (map?.getSource('image')) map.removeSource('image');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [georef, imageId, view.name]);

  // The mask, over the mask area
  useEffect(() => {
    if (!georef || !maskArea) return undefined;
    const { canvas, stop } = watchMaskCanvas(() => {
      if (mapRef.current) refreshCanvasSource(mapRef.current, 'mask');
    });
    const cancelReady = canvas ? whenReady((map) => {
      if (!map.getSource('mask')) {
        addCanvasSource(map, 'mask', canvas, areaCorners(georef, maskArea), useSegmentationStore.getState().showMask);
      }
    }) : () => {};
    return () => {
      cancelReady();
      stop();
      const map = mapRef.current;
      if (map?.getLayer('mask')) map.removeLayer('mask');
      if (map?.getSource('mask')) map.removeSource('mask');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [georef, maskArea]);

  // The brush, at the pixel under the mouse in whichever view it is
  useEffect(() => {
    if (!georef) return undefined;
    const update = () => {
      const source = mapRef.current?.getSource('brush') as GeoJSONSource | undefined;
      const { cursor, toolSize, currentTool } = useSegmentationStore.getState();
      source?.setData(currentTool === 'move' || !cursor ? NO_FEATURES : brushPolygon(georef, cursor, toolSize));
    };
    const cancelReady = whenReady(update);
    const unsubscribe = useSegmentationStore.subscribe((s, prev) => {
      if (s.cursor !== prev.cursor || s.toolSize !== prev.toolSize || s.currentTool !== prev.currentTool) update();
    });
    return () => {
      cancelReady();
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [georef]);

  // Painting with the left button
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !georef) return undefined;
    const pixelOf = (e: MapMouseEvent): [number, number] => {
      const [x, y] = lngLatToPixel(georef, [e.lngLat.lng, e.lngLat.lat]);
      return [Math.floor(x), Math.floor(y)];
    };
    const onMouseDown = (e: MapMouseEvent) => {
      const pixel = pixelOf(e);
      useSegmentationStore.getState().setCursor(pixel);
      if (e.originalEvent.button === 0) startStroke(pixel);
    };
    const onMouseMove = (e: MapMouseEvent) => {
      const pixel = pixelOf(e);
      useSegmentationStore.getState().setCursor(pixel);
      if (e.originalEvent.buttons & 1) continueStroke(pixel);
    };
    const onMouseOut = () => useSegmentationStore.getState().setCursor(null);
    // The stroke ends wherever the button is released
    const onMouseUp = (e: MouseEvent) => { if (e.button === 0) endStroke(); };
    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseout', onMouseOut);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseout', onMouseOut);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [georef]);

  // Panning: the move tool drags the map, the right and middle buttons always do
  useEffect(() => {
    const map = mapRef.current;
    const wrapper = wrapperRef.current;
    if (!map || !wrapper) return undefined;

    const applyTool = (tool: string) => {
      if (tool === 'move') {
        map.dragPan.enable();
        map.getCanvas().style.cursor = '';
      } else {
        map.dragPan.disable();
        map.getCanvas().style.cursor = 'crosshair';
      }
    };
    applyTool(useSegmentationStore.getState().currentTool);
    const unsubscribe = useSegmentationStore.subscribe((s, prev) => {
      if (s.currentTool !== prev.currentTool) applyTool(s.currentTool);
    });

    let panFrom: [number, number] | null = null;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || e.button === 2) {
        panFrom = [e.clientX, e.clientY];
        e.preventDefault();
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!panFrom) return;
      map.panBy([panFrom[0] - e.clientX, panFrom[1] - e.clientY], { animate: false });
      panFrom = [e.clientX, e.clientY];
    };
    const onMouseUp = () => { panFrom = null; };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    // Shift and the wheel resize the brush instead of zooming
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      const s = useSegmentationStore.getState();
      if (s.currentTool === 'move') return;
      // Shift turns the wheel sideways on some systems
      const delta = e.deltaY || e.deltaX;
      if (!delta) return;
      const step = delta < 0 ? biggerBrushSize : smallerBrushSize;
      s.setBrushSize(s.currentTool, step(s.brushSizes[s.currentTool]));
    };

    wrapper.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    wrapper.addEventListener('contextmenu', onContextMenu);
    wrapper.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => {
      unsubscribe();
      wrapper.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      wrapper.removeEventListener('contextmenu', onContextMenu);
      wrapper.removeEventListener('wheel', onWheel, { capture: true });
    };
  }, [georef]);

  const message = !corners
    ? 'This image has no coordinates. IRIS needs georeferenced COGs.'
    : status === 'error' ? `Could not load the view ${view.name}` : status === 'loading' ? 'Loading...' : null;

  return (
    <div ref={wrapperRef} className="map-view" style={{ position: 'absolute', inset: 0 }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {message && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          maxWidth: '80%',
          fontSize: '12px',
          textAlign: 'center',
          color: status === 'error' || !corners ? theme.alert : theme.gray500,
          pointerEvents: 'none',
        }}>
          {message}
        </div>
      )}
    </div>
  );
};

export default MapView;
