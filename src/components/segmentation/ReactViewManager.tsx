/**
 * React ViewManager Component
 * 
 * This component replaces the legacy ViewManager class with a React-based implementation.
 * It manages multiple ViewPorts and their associated layers (RGB, Mask, Preview, etc.).
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useViewManagerStore } from '../../stores/viewManagerStore';

import ReactViewPort from './ReactViewPort';

interface ReactViewManagerProps {
  className?: string;
  style?: React.CSSProperties;
}

const ReactViewManager: React.FC<ReactViewManagerProps> = ({ 
  className = '',
  style = {} 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { currentGroup, viewWidth, viewHeight, showControls, imageId, currentView, updateViewDimensions, setImageLocation, setCurrentView } = useViewManagerStore(useShallow(s => ({ currentGroup: s.currentGroup, viewWidth: s.viewWidth, viewHeight: s.viewHeight, showControls: s.showControls, imageId: s.imageId, currentView: s.currentView, updateViewDimensions: s.updateViewDimensions, setImageLocation: s.setImageLocation, setCurrentView: s.setCurrentView })));
  
  const currentViews = useViewManagerStore(useShallow(s => s.getCurrentViews()));
  
  useEffect(() => {
    window.addEventListener('resize', updateViewDimensions);
    updateViewDimensions();
    return () => window.removeEventListener('resize', updateViewDimensions);
  }, [updateViewDimensions, currentViews.length]);
  
  // Handle image location changes (for Bing maps, etc.)
  const handleImageLocationChange = useCallback((newLocation: [number, number]) => {
    setImageLocation(newLocation);
  }, [setImageLocation]);
  
  if (!imageId || currentViews.length === 0) {
    return (
      <div 
        ref={containerRef}
        className={`react-view-manager ${className}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '400px',
          color: '#666',
          fontSize: '12px',
          padding: '20px',
          ...style
        }}
      >
        <div style={{ marginBottom: '10px', fontSize: '14px' }}>
          No views configured or image not loaded
        </div>
        <div style={{ marginBottom: '10px', fontSize: '12px', color: '#999' }}>
          Draw at least 10 pixels from two classes!
        </div>
      </div>
    );
  }
  
  return (
    <div 
      ref={containerRef}
      className={`react-view-manager ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'nowrap', // Keep all views in one row
        gap: '0px',
        width: '100%',
        height: '100%',
        minHeight: '0', // Allow shrinking
        maxHeight: '100%', // Don't exceed parent
        position: 'relative',
        overflow: 'hidden', // Prevent overflow, force fit
        boxSizing: 'border-box', // Include padding/border in dimensions
        ...style
      }}
    >
      {currentViews.map((view, index) => (
        <ReactViewPort
          key={`${currentGroup}-${view.name}-${index}`}
          view={view}
          index={index}
          width={viewWidth}
          height={viewHeight}
          showControls={showControls}
          imageId={imageId}
          onImageLocationChange={handleImageLocationChange}
          isActive={currentView === view.name}
          onViewActivate={() => setCurrentView(view.name)}
        />
      ))}
    </div>
  );
};

export default ReactViewManager;