/**
 * React Bing Layer Component
 * 
 * This component replaces the legacy BingLayer class.
 * It handles Bing Maps iframe embedding with geographic coordinates from React store.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import ReactBaseLayer, { ReactBaseLayerProps } from './ReactBaseLayer';
import { useSegmentationStore } from '../../../stores/segmentationStore';

interface ReactBingLayerProps extends Omit<ReactBaseLayerProps, 'children'> {
  onLocationChange?: (location: [number, number]) => void;
}

const ReactBingLayer: React.FC<ReactBingLayerProps> = ({
  view,
  width,
  height,
  zIndex,
  className = '',
  style = {},
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Get image location from React store
  const imageLocation = useSegmentationStore(state => state.imageLocation);
  
  // Update Bing Maps URL
  const updateBingMap = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    
    // Format location for Bing Maps
    const location = `${imageLocation[0]}~${imageLocation[1]}`;
    
    let url = "https://www.bing.com/maps/embed?";
    url += `h=${height}`;
    url += `&w=${width}`;
    url += `&cp=${location}`;
    url += "&lvl=12&typ=d&sty=a&src=SHELL&FORM=MBEDV8";
    
    iframe.src = url;
  }, [imageLocation, width, height]);
  
  // Update when size changes
  useEffect(() => {
    updateBingMap();
  }, [updateBingMap]);
  
  // Update when image location changes
  useEffect(() => {
    updateBingMap();
  }, [imageLocation, updateBingMap]);
  
  
  const iframeStyle: React.CSSProperties = {
    width: `${width}px`,
    height: `${height}px`,
    border: '1px solid #ccc',
    ...style,
  };
  
  return (
    <ReactBaseLayer
      view={view}
      width={width}
      height={height}
      zIndex={zIndex}
      className={`react-bing-layer ${className}`}
    >
      <iframe
        ref={iframeRef}
        style={iframeStyle}
        frameBorder="0"
        title={`Bing Map - ${view.name}`}
      />
    </ReactBaseLayer>
  );
};

export default ReactBingLayer;