import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import ToolButton from './toolbar/ToolButton';
import BrushTool from './toolbar/BrushTool';
import Sidebar, { SidebarGroup } from './Sidebar';
import { useSegmentationStore } from '../../stores/segmentationStore';

interface LeftToolbarProps {
  expanded: boolean;
  onToggle: () => void;
  onResetMask: () => void;
}

const LeftToolbar: React.FC<LeftToolbarProps> = ({ expanded, onToggle, onResetMask }) => {
  const { currentTool, setCurrentTool, predictMask, resetViews, isLoading, showErrorModal } = useSegmentationStore(useShallow(s => ({ currentTool: s.currentTool, setCurrentTool: s.setCurrentTool, predictMask: s.predictMask, resetViews: s.resetViews, isLoading: s.isLoading, showErrorModal: s.showErrorModal })));

  const handlePredictMask = async () => {
    try {
      await predictMask();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showErrorModal(errorMessage, 'AI Prediction Error');
    }
  };

  const handleUndo = () => useSegmentationStore.getState().undo();

  const handleRedo = () => useSegmentationStore.getState().redo();

  // Labels only fit in the expanded column
  const label = (text: string) => (expanded ? text : undefined);

  return (
    <Sidebar side="left" expanded={expanded} onToggle={onToggle} name="toolbar" command="left_toolbar">
      {/* Drawing Tools */}
      <SidebarGroup expanded={expanded}>
        <ToolButton
          id="tb_tool_move"
          icon="/segmentation/static/icons/move.png"
          checked={currentTool === 'move'}
          onClick={() => setCurrentTool('move')}
          disabled={isLoading}
          title="Move/Pan"
          label={label('Move')}
        />
        <BrushTool
          tool="draw"
          id="tb_tool_draw"
          icon="/segmentation/static/icons/pencil.png"
          disabled={isLoading}
          title="Draw pixels"
          label={label('Draw')}
        />
        <BrushTool
          tool="eraser"
          id="tb_tool_eraser"
          icon="/segmentation/static/icons/eraser.png"
          disabled={isLoading}
          title="Erase pixels"
          label={label('Erase')}
        />
      </SidebarGroup>

      {/* Editing Tools */}
      <SidebarGroup expanded={expanded}>
        <ToolButton
          id="tb_undo"
          icon="/segmentation/static/icons/undo.png"
          onClick={handleUndo}
          title="Undo"
          label={label('Undo')}
        />
        <ToolButton
          id="tb_redo"
          icon="/segmentation/static/icons/redo.png"
          onClick={handleRedo}
          title="Redo"
          label={label('Redo')}
        />
      </SidebarGroup>

      {/* AI & Reset Tools */}
      <SidebarGroup expanded={expanded} last>
        <ToolButton
          id="tb_predict_mask"
          icon="/segmentation/static/icons/ai.png"
          onClick={handlePredictMask}
          disabled={isLoading}
          title={isLoading ? 'Predicting...' : 'Predict mask using AI'}
          label={label('AI Predict')}
        />
        <ToolButton
          id="tb_reset_mask"
          icon="/segmentation/static/icons/reset_mask.png"
          onClick={onResetMask}
          disabled={isLoading}
          title="Reset mask"
          label={label('Reset Mask')}
        />
        <ToolButton
          id="tb_tool_reset_views"
          icon="/segmentation/static/icons/reset_views.png"
          onClick={resetViews}
          disabled={isLoading}
          title="Reset views"
          label={label('Reset Views')}
        />
      </SidebarGroup>
    </Sidebar>
  );
};

export default LeftToolbar;
