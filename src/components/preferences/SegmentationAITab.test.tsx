import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import SegmentationAITab from './SegmentationAITab';
import { UserConfig } from '../../types/iris';
import { ThemeProvider } from '../../contexts/ThemeContext';

const renderWithTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

const mockConfig: UserConfig = {
  segmentation: {
    ai_model: {
      bands: ['B1', 'B2'],
      n_estimators: 100,
      n_leaves: 31,
      max_depth: -1,
      train_ratio: 0.8,
      max_train_pixels: 10000,
      suppression_threshold: 0.5,
      suppression_filter_size: 5,
      suppression_default_class: 0,
      use_edge_filter: false,
      use_meshgrid: false,
      meshgrid_cells: '5x5',
      use_superpixels: false,
      n_jobs: -1,
      type: 'lightgbm',
      linear_c: 1,
      class_weight: null,
    },
  },
  classes: [
    { name: 'Class 1', css_colour: '#ff0000', colour: [255, 0, 0, 255] as [number, number, number, number] },
    { name: 'Class 2', css_colour: '#00ff00', colour: [0, 255, 0, 255] as [number, number, number, number] },
  ],
};

describe('SegmentationAITab', () => {
  it('renders the AI configuration sections', () => {
    renderWithTheme(
      <SegmentationAITab
        config={mockConfig}
        allBands={['B1', 'B2', 'B3', 'B4']}
        updateAIModelConfig={vi.fn()}
        moveBands={vi.fn()}
      />
    );

    expect(screen.getByText('Model Parameters')).toBeInTheDocument();
    expect(screen.getByText('Postprocessing')).toBeInTheDocument();
    expect(screen.getByText('Model Inputs')).toBeInTheDocument();
  });

  it('displays model parameter values', () => {
    renderWithTheme(
      <SegmentationAITab
        config={mockConfig}
        allBands={['B1', 'B2', 'B3', 'B4']}
        updateAIModelConfig={vi.fn()}
        moveBands={vi.fn()}
      />
    );

    const nEstimatorsInput = screen.getByTestId('input-n-estimators') as HTMLInputElement;
    expect(nEstimatorsInput.value).toBe('100');
  });

  it('renders with themed styling', () => {
    const { container } = renderWithTheme(
      <SegmentationAITab
        config={mockConfig}
        allBands={['B1', 'B2', 'B3', 'B4']}
        updateAIModelConfig={vi.fn()}
        moveBands={vi.fn()}
      />
    );
    const div = container.querySelector('[data-testid="segmentation-ai-tab"]');
    expect(div).toBeInTheDocument();
  });

  it('switches the model, and shows the setting of the linear one', () => {
    const update = vi.fn();
    const { rerender } = renderWithTheme(
      <SegmentationAITab config={mockConfig} allBands={['B1', 'B2']} updateAIModelConfig={update} moveBands={vi.fn()} />,
    );
    expect(screen.getByTestId('input-n-estimators')).toBeInTheDocument();
    expect(screen.queryByTestId('input-linear-c')).toBeNull();
    fireEvent.change(screen.getByTestId('select-model-type'), { target: { value: 'linear' } });
    expect(update).toHaveBeenCalledWith('type', 'linear');

    const linear = { ...mockConfig, segmentation: { ...mockConfig.segmentation,
      ai_model: { ...mockConfig.segmentation.ai_model, type: 'linear' as const } } };
    rerender(
      <ThemeProvider>
        <SegmentationAITab config={linear} allBands={['B1', 'B2']} updateAIModelConfig={update} moveBands={vi.fn()} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('input-n-estimators')).toBeNull();
    fireEvent.change(screen.getByTestId('input-linear-c'), { target: { value: '0.5' } });
    expect(update).toHaveBeenCalledWith('linear_c', 0.5);
    fireEvent.click(screen.getByTestId('checkbox-class-weight'));
    expect(update).toHaveBeenCalledWith('class_weight', 'balanced');
  });
});
