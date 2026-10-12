/**
 * The page-wide loading overlay and the transient notice line.
 * Uses the existing `.loader` and `.message` styles from main.css.
 */

import React from 'react';
import { useSegmentationStore } from '../../stores/segmentationStore';

const PageFeedback: React.FC = () => {
  const loadingMessage = useSegmentationStore(s => s.loadingMessage);
  const notice = useSegmentationStore(s => s.notice);

  return (
    <>
      {loadingMessage !== null && (
        <div className="loader" style={{ visibility: 'visible' }} role="status" aria-live="polite">
          <div style={{
            textAlign: 'center', width: '200px', margin: 0, position: 'absolute',
            top: '50%', left: '50%', marginRight: '-50%', transform: 'translate(-50%, -50%)',
          }}>
            <div className="loader-spin" />
            <div className="loader-text">{loadingMessage}</div>
          </div>
        </div>
      )}
      {notice !== null && (
        <div className="message" style={{ visibility: 'visible' }} role="status" aria-live="polite">
          {notice.text}
        </div>
      )}
    </>
  );
};

export default PageFeedback;
