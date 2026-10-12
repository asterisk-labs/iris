/**
 * The three stacked canvases of one image view (image, mask, preview).
 *
 * Loads the view's rendered image and hands the canvases to the canvas
 * controller, which does all the drawing and pointer handling.
 */

import React, { useEffect, useId, useRef, useState } from 'react';
import type { ViewConfig } from '../../stores/viewManagerStore';
import { useSegmentationStore } from '../../stores/segmentationStore';
import { canvasController } from '../../segmentation/canvas/CanvasController';

interface ViewportCanvasesProps {
  view: ViewConfig;
  imageId: string;
}

const canvasStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  display: 'block',
  backgroundColor: 'transparent',
  cursor: 'crosshair',
  userSelect: 'none',
  touchAction: 'none',
};

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  fontSize: '12px',
  textAlign: 'center',
  pointerEvents: 'none',
};

const ViewportCanvases: React.FC<ViewportCanvasesProps> = ({ view, imageId }) => {
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const rgbRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const mainUrl = useSegmentationStore(s => s.apiUrls?.main ?? '/');

  useEffect(() => {
    const container = containerRef.current;
    const rgb = rgbRef.current;
    const mask = maskRef.current;
    const preview = previewRef.current;
    if (!container || !rgb || !mask || !preview) return;
    canvasController.attachViewport(id, container, { rgb, mask, preview });
    return () => canvasController.detachViewport(id);
  }, [id]);

  useEffect(() => {
    setStatus('loading');
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (cancelled) return;
      setStatus('ready');
      canvasController.setImage(id, image);
    };
    image.onerror = () => {
      if (!cancelled) setStatus('error');
    };
    image.src = `${mainUrl}image/${imageId}/${view.name}`;
    return () => {
      cancelled = true;
      canvasController.setImage(id, null);
    };
  }, [id, imageId, view.name, mainUrl]);

  return (
    <div
      ref={containerRef}
      className="viewport-canvases"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
    >
      <canvas ref={rgbRef} style={{ ...canvasStyle, zIndex: 1 }} />
      <canvas ref={maskRef} style={{ ...canvasStyle, zIndex: 2 }} />
      <canvas ref={previewRef} style={{ ...canvasStyle, zIndex: 3 }} />
      {status === 'loading' && (
        <div style={{ ...overlayStyle, color: '#666' }}>Loading...</div>
      )}
      {status === 'error' && (
        <div style={{ ...overlayStyle, color: '#d32f2f' }}>
          Failed to load<br />
          {view.name}
        </div>
      )}
    </div>
  );
};

export default ViewportCanvases;
