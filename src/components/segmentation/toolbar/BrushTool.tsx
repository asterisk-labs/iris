/**
 * Draw or erase tool, with two buttons to make its brush smaller or bigger
 */

import React from 'react';
import ToolButton from './ToolButton';
import { useSegmentationStore } from '../../../stores/segmentationStore';
import { BRUSH_SIZES, biggerBrushSize, smallerBrushSize } from '../../../stores/segmentation/toolSlice';
import { useTheme } from '../../../contexts/ThemeContext';
import { Command, tooltip } from '../../../segmentation/input/shortcuts';
import { controlButtonStyle } from '../../controlStyles';

const SizeButton: React.FC<{
  text: string;
  label: string;
  /** Its key, only on the brush in use since the keys resize that one */
  command?: Command;
  disabled?: boolean;
  onClick: () => void;
}> = ({ text, label, command, disabled = false, onClick }) => {
  const { theme } = useTheme();
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      // Not focused by a click, so Space and Enter don't press it again
      onMouseDown={(e) => e.preventDefault()}
      disabled={disabled}
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...tooltip(label, ...(command ? [command] : []))}
      style={{
        ...controlButtonStyle(theme, { hovered: hovered && !disabled }),
        flex: 1,
        minHeight: '26px',
        minWidth: 0,
        padding: 0,
        fontSize: '15px',
        lineHeight: 1,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {text}
    </button>
  );
};

interface BrushToolProps {
  tool: 'draw' | 'eraser';
  id: string;
  icon: string;
  title: string;
  /** Shown in the expanded toolbar */
  label?: string;
  disabled?: boolean;
}

const BrushTool: React.FC<BrushToolProps> = ({ tool, id, icon, title, label, disabled = false }) => {
  const { theme } = useTheme();
  const currentTool = useSegmentationStore((state) => state.currentTool);
  const setCurrentTool = useSegmentationStore((state) => state.setCurrentTool);
  const size = useSegmentationStore((state) => state.brushSizes[tool]);
  const setBrushSize = useSegmentationStore((state) => state.setBrushSize);

  const name = tool === 'draw' ? 'brush' : 'eraser';
  const inUse = currentTool === tool;
  const sizeButtons = (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
      <SizeButton
        text="−"
        label={`Smaller ${name}, ${size} px now`}
        command={inUse ? 'brush_smaller' : undefined}
        disabled={disabled || size <= BRUSH_SIZES[0]}
        onClick={() => setBrushSize(tool, smallerBrushSize(size))}
      />
      {label && (
        <span style={{
          minWidth: '22px',
          textAlign: 'center',
          fontSize: '11px',
          fontVariantNumeric: 'tabular-nums',
          color: theme.gray600,
        }}>{size}</span>
      )}
      <SizeButton
        text="+"
        label={`Bigger ${name}, ${size} px now`}
        command={inUse ? 'brush_bigger' : undefined}
        disabled={disabled || size >= BRUSH_SIZES[BRUSH_SIZES.length - 1]}
        onClick={() => setBrushSize(tool, biggerBrushSize(size))}
      />
    </div>
  );

  return (
    <div style={{
      display: 'flex',
      flexDirection: label ? 'row' : 'column',
      alignItems: 'stretch',
      gap: '4px',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <ToolButton
          id={id}
          icon={icon}
          checked={currentTool === tool}
          onClick={() => setCurrentTool(tool)}
          disabled={disabled}
          title={`${title}, ${size} px`}
          label={label}
        />
      </div>
      {label ? <div style={{ width: '86px', display: 'flex' }}>{sizeButtons}</div> : sizeButtons}
    </div>
  );
};

export default BrushTool;
