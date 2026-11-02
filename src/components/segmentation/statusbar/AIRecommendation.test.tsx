import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { render, screen } from '../../../test/test-utils';
import AIRecommendation from './AIRecommendation';
import { useSegmentationStore } from '../../../stores/segmentationStore';
import type { ConfusionMatrix } from '../../../types/iris';

const classes = [
  { name: 'clear', colour: [0, 0, 0, 0] as [number, number, number, number] },
  { name: 'cloud', colour: [255, 255, 255, 255] as [number, number, number, number] },
];

const matrix: ConfusionMatrix = {
  matrix: [[5, 5], [0, 10]],
  classCount: 2,
  totalSamples: 20,
  accuracyStats: { overall: 0.6, perClass: [0.5, 1], worstClass: 0, worstAccuracy: 0.5, truePositives: { 0: 5, 1: 10 } },
  timestamp: new Date(),
  classes: ['clear', 'cloud'],
};

describe('AIRecommendation', () => {
  beforeEach(() => {
    useSegmentationStore.setState({
      classes, confusionMatrix: null, predictionRevision: null, maskRevision: 1,
      userPixelCounts: { 0: 0, 1: 0, total: 0 },
    });
  });

  it('asks for pixels from two classes until there are enough', () => {
    const { container } = render(<AIRecommendation />);
    expect(container.querySelector('#ai-recommendation')).toBeInTheDocument();
    expect(screen.getByText('Draw at least 10 pixels from two classes!')).toBeInTheDocument();
    act(() => useSegmentationStore.setState({ userPixelCounts: { 0: 11, 1: 11, total: 22 } }));
    expect(screen.getByText('Start the training!')).toBeInTheDocument();
  });

  it('names the worst class after a prediction, until the mask is edited', () => {
    useSegmentationStore.setState({
      userPixelCounts: { 0: 11, 1: 11, total: 22 }, confusionMatrix: matrix, predictionRevision: 1,
    });
    render(<AIRecommendation />);
    expect(screen.getByText('clear')).toBeInTheDocument();
    act(() => useSegmentationStore.setState({ maskRevision: 2 }));
    expect(screen.getByText('Start the training!')).toBeInTheDocument();
  });
});
