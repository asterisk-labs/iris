import React, { useMemo } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import { BrainIcon } from '../../icons/ToolbarIcons';
import { useSegmentationStore } from '../../../stores/segmentationStore';
import { usableClasses } from '../../../segmentation/ai/sampling';
import { aiRecommendation } from '../../../segmentation/ai/metrics';

const AIRecommendation: React.FC = () => {
  const { theme } = useTheme();
  const counts = useSegmentationStore(s => s.userPixelCounts);
  const classes = useSegmentationStore(s => s.classes);
  const confusionMatrix = useSegmentationStore(s => s.confusionMatrix);
  const maskRevision = useSegmentationStore(s => s.maskRevision);
  const predictionRevision = useSegmentationStore(s => s.predictionRevision);

  const recommendation = useMemo(() => aiRecommendation(
    predictionRevision === maskRevision ? confusionMatrix : null,
    usableClasses(counts).length,
    classes.map(c => c.name),
  ), [counts, classes, confusionMatrix, maskRevision, predictionRevision]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '6px',
        color: theme.toolbarText,
        fontSize: '13px',
        fontWeight: '500',
        minWidth: '200px',
      }}
    >
      <BrainIcon size={18} color={theme.toolbarText} />
      <div
        id="ai-recommendation"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        {recommendation.text}
        {recommendation.className && <b>{recommendation.className}</b>}
      </div>
    </div>
  );
};

export default AIRecommendation;
