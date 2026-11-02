/**
 * The image views area: shows the view manager once the project config
 * has loaded.
 */

import React from 'react';
import ReactViewManager from './ReactViewManager';
import ErrorBoundary from './ErrorBoundary';
import { useSegmentationStore } from '../../stores/segmentationStore';

interface ViewerComparisonProps {
  // Props interface kept for future extensibility
}

const ViewerComparison: React.FC<ViewerComparisonProps> = () => {
  // useConfigLoader fills in the views once the config has loaded
  const configLoaded = useSegmentationStore(s => s.config !== null);

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%', // Use full available height
    minHeight: '0', // Allow shrinking
    maxHeight: '100%', // Don't exceed parent
    backgroundColor: '#fff',
    overflow: 'hidden', // Prevent overflow
    padding: '10px',
    boxSizing: 'border-box', // Include padding in dimensions
    display: 'flex', // Use flexbox for proper sizing
    flexDirection: 'column', // Stack children vertically
  };
  
  return (
    <div style={containerStyle}>
      {configLoaded ? (
        <ErrorBoundary
          onError={(error, errorInfo) => {
            console.error('React ViewManager crashed:', error, errorInfo);
          }}
        >
          <ReactViewManager style={{ flex: 1 }} />
        </ErrorBoundary>
      ) : (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            color: '#666',
            fontSize: '14px',
          }}
        >
          Loading configuration...
        </div>
      )}
    </div>
  );
};

export default ViewerComparison;